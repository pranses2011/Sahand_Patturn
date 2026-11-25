import { expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { buildOrthogonalCutter } from '@patturn/kernel';
import { toBinaryStl, toOrthogonalCutterSvg, toOrthogonalCutterDxf } from '@patturn/exporters';
import { toOrthogonalCutterBundle } from './orthogonal-cutter-bundle';
import {
  readOrthogonalCutterFile,
  writeOrthogonalCutterFile,
  type OrthogonalCutterFile,
} from './orthogonal-cutter-file';
import messages from './messages/fa.json';
const doc: OrthogonalCutterFile = {
  format: 'patturn-orthogonal-cutter',
  version: 1,
  units: 'mm',
  heightMm: 25,
  wallMm: 2,
  tipMm: 0.8,
  points: [
    [10.25, 20.5],
    [90.25, 20.5],
    [90.25, 50.5],
    [40.25, 50.5],
    [40.25, 100.5],
    [10.25, 100.5],
  ],
};
const guide = messages.orthogonalCutter.zipInstructions;
it('archives one consistent independent mm tool snapshot with validated STL and local guide', async () => {
  const result = await toOrthogonalCutterBundle(writeOrthogonalCutterFile(doc), guide);
  expect(result.ok, result.error).toBe(true);
  expect(result.filename).toBe('orthogonal-cutter_build_mm.zip');
  const entries = unzipSync(result.bytes!);
  expect(Object.keys(entries).sort()).toEqual([
    'README.txt',
    'boundaries/inner.dxf',
    'boundaries/inner.svg',
    'cutter.orthogonal.json',
    'manifest.json',
    'parts/cutter.stl',
  ]);
  const restored = readOrthogonalCutterFile(strFromU8(entries['cutter.orthogonal.json']!));
  expect(restored).toEqual(doc);
  expect(entries['parts/cutter.stl']).toEqual(
    toBinaryStl(buildOrthogonalCutter(restored.points, restored), 'parts/cutter.stl').bytes,
  );
  expect(entries['boundaries/inner.svg']).toEqual(toOrthogonalCutterSvg(restored.points).bytes);
  expect(entries['boundaries/inner.dxf']).toEqual(
    toOrthogonalCutterDxf(restored.points, restored).bytes,
  );
  expect(strFromU8(entries['README.txt']!).replace(/^\uFEFF/, '')).toBe(guide);
  const manifest = JSON.parse(strFromU8(entries['manifest.json']!));
  expect(manifest.units).toBe('mm');
  expect(manifest.stlValidated).toBe(true);
  for (const file of manifest.files) expect(entries[file.path]!.byteLength).toBe(file.bytes);
});
it('snapshots bytes before asynchronous compression and produces deterministic archives', async () => {
  const bytes = writeOrthogonalCutterFile(doc),
    before = bytes.slice();
  const pending = toOrthogonalCutterBundle(bytes, guide);
  bytes.fill(0);
  const output = await pending;
  expect(output.ok).toBe(true);
  expect(output.bytes).toEqual((await toOrthogonalCutterBundle(before, guide)).bytes);
});
it.each(['before', 'during'] as const)(
  'returns no archive when cancelled %s compression',
  async (timing) => {
    const controller = new AbortController();
    if (timing === 'before') controller.abort();
    const pending = toOrthogonalCutterBundle(
      writeOrthogonalCutterFile(doc),
      guide,
      controller.signal,
    );
    controller.abort();
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.bytes).toBeUndefined();
    expect(result.error).toContain('EXPORT_CANCELLED');
  },
);
it.each([
  { name: 'syntax', bytes: new TextEncoder().encode('{') },
  { name: 'future', bytes: new TextEncoder().encode(JSON.stringify({ ...doc, version: 2 })) },
  {
    name: 'invalid geometry',
    bytes: new TextEncoder().encode(JSON.stringify({ ...doc, wallMm: 12 })),
  },
  { name: 'UTF8', bytes: new Uint8Array([255]) },
  { name: 'oversize', bytes: new Uint8Array(65537) },
])('rejects $name atomically', async ({ bytes }) => {
  const result = await toOrthogonalCutterBundle(bytes, guide);
  expect(result.ok).toBe(false);
  expect(result.filename).toBe('');
  expect(result.bytes).toBeUndefined();
});
