import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cargoWorkspace, prepareDesktopVersion } from './desktop-version.mjs';
import { readAppVersion, validateAppVersion } from './version-source.mjs';
for (const version of ['0.3.2', '1.2.3-rc.1', '1.2.3+build.4'])
  test(`one source accepts canonical ${version}`, () =>
    assert.equal(validateAppVersion(version), version));
for (const version of [
  undefined,
  null,
  '',
  '1.2',
  'v1.2.3',
  '01.2.3',
  '1.2.3 ',
  '1.2.3\n[malicious]',
  '1.2.3-01',
])
  test(`rejects noncanonical source ${JSON.stringify(version)}`, () =>
    assert.throws(() => cargoWorkspace(version), /INVALID_RELEASE_VERSION/));
test('Cargo inherits the current JSON version, regeneration is idempotent and follows a single-field edit', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'patturn-cargo-version-'));
  try {
    const source = path.join(folder, 'package.json'),
      generated = path.join(folder, 'Cargo.toml');
    await writeFile(source, JSON.stringify({ version: '1.2.3' }));
    assert.equal(await prepareDesktopVersion(folder), '1.2.3');
    assert.equal(await readFile(generated, 'utf8'), cargoWorkspace('1.2.3'));
    const before = (await stat(generated)).mtimeMs;
    await prepareDesktopVersion(folder);
    assert.equal((await stat(generated)).mtimeMs, before);
    await writeFile(source, JSON.stringify({ version: '1.2.4' }));
    assert.equal(await readAppVersion(folder), '1.2.4');
    await prepareDesktopVersion(folder);
    assert.match(await readFile(generated, 'utf8'), /version = "1.2.4"/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test('never overwrites an unmanaged Cargo workspace', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'patturn-cargo-protect-'));
  try {
    await writeFile(path.join(folder, 'package.json'), '{"version":"1.0.0"}');
    await writeFile(path.join(folder, 'Cargo.toml'), '[workspace]\nmembers=[]\n');
    await assert.rejects(prepareDesktopVersion(folder), /REFUSE_TO_OVERWRITE/);
    assert.equal(
      await readFile(path.join(folder, 'Cargo.toml'), 'utf8'),
      '[workspace]\nmembers=[]\n',
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test('repository Cargo manifest and output path remain linked to the generated workspace', async () => {
  const cargo = await readFile(
    new URL('../apps/desktop/src-tauri/Cargo.toml', import.meta.url),
    'utf8',
  );
  assert.match(cargo, /version\.workspace = true/);
  const config = await readFile(new URL('../.cargo/config.toml', import.meta.url), 'utf8');
  assert.match(config, /target-dir = "apps\/desktop\/src-tauri\/target"/);
  const ignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.match(ignore, /^\/Cargo.toml$/m);
  const desktop = JSON.parse(
    await readFile(new URL('../apps/desktop/package.json', import.meta.url), 'utf8'),
  );
  for (const script of ['tauri', 'dev', 'build'])
    assert.ok(desktop.scripts[script].startsWith('node ../../scripts/desktop-version.mjs && '));
});
