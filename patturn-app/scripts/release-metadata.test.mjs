import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkReleaseMetadata, validateReleaseMetadata } from './release-metadata.mjs';
const metadata = (version = '0.1.0') => ({
  version,
  versions: { npm: version, tauri: version, rust: version },
  changelog: `# تغییرات\n## [${version}] — توسعه\n- اصلاح فارسی\n`,
});

test('repository package, lock, Tauri, Cargo and Persian changelog versions agree', async () => {
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
