import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { webArchive } from './package-web.mjs';
test('web installation/update archive is deterministic and contains local assets, metadata and Persian instructions', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'patturn-web-'));
  try {
    await mkdir(path.join(folder, 'assets'));
    await mkdir(path.join(folder, '.vite'));
    await writeFile(path.join(folder, 'index.html'), '<script src="./assets/app.js"></script>');
    await writeFile(path.join(folder, 'assets/app.js'), 'local code');
    await writeFile(path.join(folder, '.vite/manifest.json'), '{}');
    const metadata = { version: '0.2.0', commit: 'a'.repeat(40) },
      bytes = await webArchive(folder, metadata);
    assert.deepEqual(bytes, await webArchive(folder, metadata));
    const entries = unzipSync(bytes);
    assert.equal(strFromU8(entries['assets/app.js']), 'local code');
    assert.equal(entries['.vite/manifest.json'], undefined);
    assert.match(strFromU8(entries['README-WEB.txt']), /ارتقا/);
    assert.deepEqual(JSON.parse(strFromU8(entries['release-info.json'])), {
      ...metadata,
      experimental: true,
      automaticUpdate: false,
    });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test('does not package a missing build as a usable web installer', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'patturn-empty-'));
  try {
    await assert.rejects(webArchive(folder, {}), /WEB_RELEASE_INDEX_MISSING/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
