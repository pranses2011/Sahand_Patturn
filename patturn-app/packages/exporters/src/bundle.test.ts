import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { referenceOuterProfile, revolve } from '@patturn/kernel';
import { toBuildZip, type BuildBundle } from './index.js';
const mesh = revolve(referenceOuterProfile(8), { segments: 16, closeBottom: true, closeTop: true });
const input = (): BuildBundle => ({ project: 'گلدان', meshes: [{ path: 'parts/part-1.stl', mesh }], instructions: 'راهنمای فارسی؛ واحد mm', files: [{ path: 'BOM.txt', bytes: new TextEncoder().encode('گچ و آب') }] });

describe('Build ZIP', () => {
  it('Z1: round-trip archive contains validated STL, UTF-8 guide, BOM and manifest', async () => {
    const out = await toBuildZip(input());
    expect(out.ok, out.error).toBe(true);
    const entries = unzipSync(out.bytes!);
    expect(Object.keys(entries).sort()).toEqual(['BOM.txt', 'README.txt', 'manifest.json', 'parts/part-1.stl']);
    expect(strFromU8(entries['README.txt']!)).toContain('راهنمای فارسی');
    const stl = entries['parts/part-1.stl']!;
    expect(stl.length).toBe(84 + mesh.indices.length / 3 * 50);
    const manifest = JSON.parse(strFromU8(entries['manifest.json']!));
    expect(manifest.stlValidated).toBe(true);
    expect(manifest.units).toBe('mm');
    for (const file of manifest.files) expect(entries[file.path]!.length).toBe(file.bytes);
  });
  it('Z2: deterministic bytes for identical input', async () => {
    expect((await toBuildZip(input())).bytes).toEqual((await toBuildZip(input())).bytes);
  });
  it('Z3: one invalid part rejects the entire bundle', async () => {
    const data = input();
    data.meshes.push({ path: 'bad.stl', mesh: { positions: new Float32Array(), indices: new Uint32Array() } });
    const result = await toBuildZip(data);
    expect(result.ok).toBe(false);
    expect(result.bytes).toBeUndefined();
    expect(result.error).toContain('MESH_INVALID');
  });
  it('Z4: rejects traversal, reserved names, collisions and unvalidated STL extras', async () => {
    for (const path of ['../evil.stl', '/evil.stl', 'C:/evil.stl', 'a\\evil.stl', 'a//x.stl', 'NUL.stl']) {
      const data = input(); data.meshes[0]!.path = path;
      expect((await toBuildZip(data)).error).toContain('UNSAFE_PATH');
    }
    const data = input();
    data.files!.push({ path: 'readme.TXT', bytes: new Uint8Array() });
    expect((await toBuildZip(data)).error).toContain('DUPLICATE_PATH');
    data.files = [{ path: 'bad.stl', bytes: new Uint8Array() }];
    expect((await toBuildZip(data)).error).toContain('EXTRA_EXTENSION');
  });
  it('Z5: supports pre-cancel and active cancellation, no partial bytes', async () => {
    const controller = new AbortController(); controller.abort();
    expect((await toBuildZip(input(), controller.signal)).error).toBe('EXPORT_CANCELLED');
    const active = new AbortController();
    const pending = toBuildZip(input(), active.signal); active.abort();
    const result = await pending;
    expect(result.error).toBe('EXPORT_CANCELLED');
    expect(result.bytes).toBeUndefined();
  });
});
