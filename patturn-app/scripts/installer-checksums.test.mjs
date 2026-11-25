import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { writeInstallerChecksums } from './installer-checksums.mjs';

test('installer checksum covers exact bytes, stable ordering and test-only metadata', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'patturn-checksum-'));
  try {
    const bytes = Buffer.from([0, 1, 2, 255]);
    await writeFile(path.join(folder, 'b.exe'), bytes);
    await writeFile(path.join(folder, 'a.exe'), 'first');
    await writeFile(path.join(folder, 'ignored.txt'), 'not an executable');
    const first = await writeInstallerChecksums(folder);
    assert.equal(first.length, 2);
    assert.ok(first[0].endsWith('  a.exe'));
    assert.equal(first[1], `${createHash('sha256').update(bytes).digest('hex')}  b.exe`);
    assert.deepEqual(await writeInstallerChecksums(folder), first);
    const info = JSON.parse(await readFile(path.join(folder, 'build-info.json'), 'utf8'));
    assert.equal(info.unsigned, true);
    assert.equal(info.installationTested, false);
    assert.match(await readFile(path.join(folder, 'README-WINDOWS-TEST.txt'), 'utf8'), /WebView2/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test('no installer is an error, not an empty successful artifact', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'patturn-empty-'));
  try {
    await assert.rejects(writeInstallerChecksums(folder), /NO_NSIS_INSTALLER/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('Windows distribution embeds the full offline runtime rather than a network bootstrapper', async () => {
  const config = JSON.parse(
    await readFile(new URL('../apps/desktop/src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(config.bundle.windows.webviewInstallMode, {
    type: 'offlineInstaller',
    silent: true,
  });
  assert.ok(config.bundle.targets.includes('nsis'));
  const workflow = await readFile(
    new URL('../../.github/workflows/quality.yml', import.meta.url),
    'utf8',
  );
  assert.ok(
    workflow.indexOf('run: ./scripts/windows-installer-smoke.ps1') <
      workflow.indexOf('name: Generate checksums and test guide'),
  );
  assert.match(workflow, /windows-installer-smoke.json/);
});

test('unsigned builds do not register an unconfigured signed updater at startup', async () => {
  const main = await readFile(
    new URL('../apps/desktop/src-tauri/src/main.rs', import.meta.url),
    'utf8',
  );
  const capabilities = JSON.parse(
    await readFile(
      new URL('../apps/desktop/src-tauri/capabilities/default.json', import.meta.url),
      'utf8',
    ),
  );
  assert.doesNotMatch(main, /\.plugin\(tauri_plugin_updater/);
  assert.ok(!capabilities.permissions.includes('updater:default'));
  assert.match(main, /PATTURN_STARTUP_LOG/);
});
