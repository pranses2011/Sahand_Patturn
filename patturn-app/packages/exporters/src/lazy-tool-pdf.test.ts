import { expect, it } from 'vitest';
import {
  toRibPdf as lazyRib,
  toOrthogonalCutterPdf as lazyCutter,
  ribPdfLayout,
  orthogonalCutterPdfLayout,
} from './index';
import { toRibPdf as rib } from './rib-pdf';
import { toOrthogonalCutterPdf as cutter } from './orthogonal-cutter-pdf';
import type { CutterPoint } from '@patturn/kernel';
const points: CutterPoint[] = [
    [0, 0],
    [80, 0],
    [80, 30],
    [30, 30],
    [30, 80],
    [0, 80],
  ],
  options = { heightMm: 20, wallMm: 1.6, tipMm: 0.6 };
const contact: [number, number][] = [
  [30, 104],
  [50, 60],
  [20, 0],
];
it('preserves public layout and PDF bytes through lazy entry points', async () => {
  expect(ribPdfLayout(contact, 4).width).toBe(50);
  expect(orthogonalCutterPdfLayout(points, options).width).toBe(80);
  expect((await lazyRib(contact, 4)).bytes).toEqual((await rib(contact, 4)).bytes);
  expect((await lazyCutter(points, options)).bytes).toEqual((await cutter(points, options)).bytes);
});
it('snapshots cutter coordinates and options before the exporter module import', async () => {
  const p = points.map(([x, y]) => [x, y] as [number, number]),
    o = { ...options };
  const pending = lazyCutter(p, o);
  p[0]![0] = 10;
  o.heightMm = 30;
  expect((await pending).bytes).toEqual((await cutter(points, options)).bytes);
});
it('snapshots rib coordinates before the exporter module import', async () => {
  const p = structuredClone(contact);
  const pending = lazyRib(p, 4);
  p[0]![0] = 80;
  p.push([10, -10]);
  expect((await pending).bytes).toEqual((await rib(contact, 4)).bytes);
});
it.each(['before', 'during'] as const)(
  'rejects cancellation %s the import boundary',
  async (timing) => {
    for (const kind of ['rib', 'cutter']) {
      const controller = new AbortController();
      if (timing === 'before') controller.abort();
      const pending =
        kind === 'rib'
          ? lazyRib(contact, 4, controller.signal)
          : lazyCutter(points, options, controller.signal);
      controller.abort();
      const result = await pending;
      expect(result.ok).toBe(false);
      expect(result.bytes).toBeUndefined();
      expect(result.error).toContain('EXPORT_CANCELLED');
    }
  },
);
it('rejects excess input and invalid geometry without partial files', async () => {
  for (const pending of [
    lazyRib(
      Array.from({ length: 513 }, () => [20, 0] as const),
      4,
    ),
    lazyCutter(
      Array.from({ length: 66 }, () => [0, 0] as const),
      options,
    ),
    lazyRib([], 4),
    lazyCutter(points, { ...options, heightMm: NaN }),
  ]) {
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.bytes).toBeUndefined();
  }
});
