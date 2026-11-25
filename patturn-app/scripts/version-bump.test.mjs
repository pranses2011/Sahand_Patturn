import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bumpVersion, nextVersion } from './version-bump.mjs';
for (const [level, expected] of [
  ['patch', '0.1.1'],
  ['minor', '0.2.0'],
  ['major', '1.0.0'],
])
  test(`SemVer ${level}`, () => assert.equal(nextVersion('0.1.0', level), expected));
test('rejects ambiguous bumps', () => {
  for (const level of [undefined, '', 'feature', 'prerelease'])
    assert.throws(() => nextVersion('0.1.0', level), /INVALID_VERSION_BUMP/);
  assert.throws(() => nextVersion('bad', 'patch'), /INVALID_VERSION_BUMP/);
});
test('a bump changes only the authoritative version without touching any derived or historical file', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'patturn-single-version-'));
  try {
    const metadata = {
      name: 'app',
      version: '0.1.0',
      private: true,
      scripts: { build: 'unchanged' },
    };
    await writeFile(path.join(folder, 'package.json'), JSON.stringify(metadata));
    for (const file of ['package-lock.json', 'Cargo.toml', 'CHANGELOG.fa.md'])
      await writeFile(path.join(folder, file), 'untouched fixture');
    assert.equal(await bumpVersion(folder, 'minor'), '0.2.0');
    assert.deepEqual(JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8')), {
      ...metadata,
      version: '0.2.0',
    });
    for (const file of ['package-lock.json', 'Cargo.toml', 'CHANGELOG.fa.md'])
      assert.equal(await readFile(path.join(folder, file), 'utf8'), 'untouched fixture');
    const before = await readFile(path.join(folder, 'package.json'), 'utf8');
    await assert.rejects(bumpVersion(folder, 'bad'), /INVALID_VERSION_BUMP/);
    assert.equal(await readFile(path.join(folder, 'package.json'), 'utf8'), before);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
