import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkReleaseMetadata, validateReleaseMetadata } from './release-metadata.mjs';
const metadata = (version = '0.1.0') => ({
  version,
  versions: { npm: version, tauri: version, rust: version },
  changelog: `# تغییرات\n## [${version}] — توسعه\n- اصلاح فارسی\n`,
});

test('repository has one authoritative version, inherited consumers and a matching Persian changelog', async () => {
  const root = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(await checkReleaseMetadata(), root.version);
});
test('strict SemVer accepts explicit prerelease and build metadata', () => {
  for (const version of ['0.1.0', '1.2.3-rc.1', '1.2.3+build.4'])
    assert.equal(validateReleaseMetadata(metadata(version)), version);
});
test('noncanonical or invalid versions are rejected', () => {
  for (const version of ['v1.2.3', '1.2', '01.2.3', '1.2.3-01', '1.2.3 ', null])
    assert.throws(() => validateReleaseMetadata(metadata(version)), /INVALID_RELEASE_VERSION/);
});
test('mismatched and absent component versions cannot silently pass', () => {
  for (const value of ['0.2.0', undefined]) {
    const input = metadata();
    input.versions.tauri = value;
    assert.throws(() => validateReleaseMetadata(input), /RELEASE_VERSION_MISMATCH: tauri/);
  }
});
test('missing or duplicate current changelog heading is rejected', () => {
  for (const changelog of ['## [0.2.0]\n- فارسی', metadata().changelog + metadata().changelog]) {
    assert.throws(
      () => validateReleaseMetadata({ ...metadata(), changelog }),
      /RELEASE_CHANGELOG_ENTRY_MISSING_OR_DUPLICATE/,
    );
  }
});
test('Persian text must be in the current version section, not only elsewhere', () => {
  const changelog = '# تغییرات فارسی\n## [0.1.0]\nEnglish only\n## [0.0.9]\n- اصلاح قبلی';
  assert.throws(
    () => validateReleaseMetadata({ ...metadata(), changelog }),
    /RELEASE_CHANGELOG_PERSIAN_REQUIRED/,
  );
});

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
async function fixture(action) {
  const folder = await mkdtemp(path.join(tmpdir(), 'patturn-release-source-'));
  try {
    const files = {
      'package.json': JSON.stringify({ version: '1.0.0' }),
      'package-lock.json': JSON.stringify({
        packages: { '': {}, 'apps/desktop': {}, 'packages/config': {} },
      }),
      'apps/desktop/package.json': JSON.stringify({
        name: 'desktop',
        private: true,
        dependencies: { config: '*' },
      }),
      'packages/config/package.json': JSON.stringify({ name: 'config', private: true }),
      'apps/desktop/src-tauri/tauri.conf.json': JSON.stringify({
        version: '../../../package.json',
      }),
      'apps/desktop/src-tauri/Cargo.toml': '[package]\nname="desktop"\nversion.workspace = true\n',
      'CHANGELOG.fa.md': '## [1.0.0]\n- نسخهٔ آزمایشی\n',
    };
    for (const [file, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(folder, file)), { recursive: true });
      await writeFile(path.join(folder, file), text);
    }
    await action(folder, async (file, value) =>
      writeFile(path.join(folder, file), typeof value === 'string' ? value : JSON.stringify(value)),
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
test('a clean single-source fixture passes without generating files', () =>
  fixture(async (folder) => assert.equal(await checkReleaseMetadata(folder), '1.0.0')));
for (const [file, data, error] of [
  ['package-lock.json', { version: '1.0.0', packages: {} }, 'DUPLICATE_ROOT_LOCK_VERSION'],
  ['apps/desktop/package.json', { private: true, version: '1.0.0' }, 'DUPLICATE_WORKSPACE_VERSION'],
  [
    'apps/desktop/package.json',
    { private: true, name: 'desktop', dependencies: { config: '^1.0.0' } },
    'PINNED_INTERNAL_VERSION',
  ],
  [
    'apps/desktop/src-tauri/tauri.conf.json',
    { version: '1.0.0' },
    'TAURI_VERSION_NOT_SINGLE_SOURCE',
  ],
  [
    'apps/desktop/src-tauri/Cargo.toml',
    '[package]\nversion="1.0.0"\n',
    'CARGO_VERSION_NOT_INHERITED',
  ],
])
  test(`rejects independently maintained version in ${file}`, () =>
    fixture(async (folder, put) => {
      await put(file, data);
      await assert.rejects(checkReleaseMetadata(folder), new RegExp(error));
    }));
