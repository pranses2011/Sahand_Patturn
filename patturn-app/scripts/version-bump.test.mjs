import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextVersion } from './version-bump.mjs';
for (const [level, expected] of [
  ['patch', '0.1.1'],
  ['minor', '0.2.0'],
  ['major', '1.0.0'],
])
  test(`SemVer ${level}`, () => assert.equal(nextVersion('0.1.0', level), expected));
test('rejects ambiguous bumps rather than silently changing the wrong version', () => {
  for (const level of [undefined, '', 'feature', 'prerelease'])
    assert.throws(() => nextVersion('0.1.0', level), /INVALID_VERSION_BUMP/);
  assert.throws(() => nextVersion('bad', 'patch'), /INVALID_VERSION_BUMP/);
});

import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bumpVersion } from './version-bump.mjs';
import { checkReleaseMetadata } from './release-metadata.mjs';
test('bump synchronizes workspace dependencies, lockfile, Tauri, Cargo and Persian history', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'patturn-version-'));
  try {
    const packages = {
      '': { name: 'root', version: '0.1.0' },
      'apps/web': { name: 'web', version: '0.1.0' },
      'apps/desktop': { name: 'desktop', version: '0.1.0' },
      'packages/config': { name: 'config', version: '0.1.0' },
      'packages/storage': {
        name: 'storage',
        version: '0.1.0',
        dependencies: { config: '^0.1.0', external: '^9.0.0' },
      },
    };
    for (const [relative, data] of Object.entries(packages)) {
      await mkdir(path.join(folder, relative), { recursive: true });
      await writeFile(path.join(folder, relative, 'package.json'), JSON.stringify(data));
    }
    await mkdir(path.join(folder, 'apps/desktop/src-tauri'), { recursive: true });
    await writeFile(
      path.join(folder, 'package-lock.json'),
      JSON.stringify({ version: '0.1.0', packages }),
    );
    await writeFile(
      path.join(folder, 'apps/desktop/src-tauri/tauri.conf.json'),
      JSON.stringify({ version: '0.1.0' }),
    );
    await writeFile(
      path.join(folder, 'apps/desktop/src-tauri/Cargo.toml'),
      '[package]\nname = "desktop"\nversion = "0.1.0"\n[dependencies]\nother = "9"\n',
    );
    await writeFile(
      path.join(folder, 'CHANGELOG.fa.md'),
      '## [منتشرنشده]\n- افزودن قابلیت\n\n## [0.1.0]\n- نسخهٔ قبلی\n',
    );
    assert.equal(await bumpVersion(folder, 'minor'), '0.2.0');
    assert.equal(await checkReleaseMetadata(folder), '0.2.0');
    const storage = JSON.parse(await readFile(path.join(folder, 'packages/storage/package.json')));
    assert.equal(storage.dependencies.config, '^0.2.0');
    assert.equal(storage.dependencies.external, '^9.0.0');
    const before = await readFile(path.join(folder, 'package.json'), 'utf8');
    await assert.rejects(bumpVersion(folder, 'patch'), /UNRELEASED_CHANGES_REQUIRED/);
    assert.equal(await readFile(path.join(folder, 'package.json'), 'utf8'), before);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
