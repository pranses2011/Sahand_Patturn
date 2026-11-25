import { expect, it } from 'vitest';
import {
  orthogonalCutterPdfLayout as layout,
  toOrthogonalCutterPdf as pdf,
} from './orthogonal-cutter-pdf';
import type { CutterPoint } from '@patturn/kernel';
const points: CutterPoint[] = [
    [10.125, 20.25],
    [90.125, 20.25],
    [90.125, 50.25],
    [40.125, 50.25],
    [40.125, 80.25],
    [10.125, 80.25],
  ],
  options = { heightMm: 24, wallMm: 1.6, tipMm: 0.6 };
const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);
it('keeps concavity and exact mm after translating only the minimum origin', () => {
  expect(layout(points, options)).toEqual({
    width: 80,
    height: 60,
    points: [
      [0, 0],
      [80, 0],
      [80, 30],
      [30, 30],
      [30, 60],
      [0, 60],
    ],
  });
});
it('embeds offline font and one A4 page with exact outline and 100mm ruler', async () => {
  const result = await pdf(points, options);
  expect(result.ok, result.error).toBe(true);
  const source = text(result.bytes!);
  expect(source.startsWith('%PDF-')).toBe(true);
  expect(source.match(/\/Type \/Page\b/g)).toHaveLength(1);
  expect(source).toContain('/MediaBox [0 0 595.28 841.89]');
  expect(source).toContain('/FontFile2');
  const lines = [...source.matchAll(/([\d.]+) ([\d.]+) m\n([\d.]+) ([\d.]+) l/g)].map((m) =>
    m.slice(1).map((n) => (Number(n) * 25.4) / 72),
  );
  expect(lines.some((l) => [15, 17, 115, 17].every((n, i) => Math.abs(l[i]! - n) < 0.001))).toBe(
    true,
  );
  expect(lines.some((l) => [25, 247, 105, 247].every((n, i) => Math.abs(l[i]! - n) < 0.001))).toBe(
    true,
  );
  expect(result.filename).toContain('A4-1to1.pdf');
});
it('produces deterministic bytes with an optional live signal', async () => {
  expect((await pdf(points, options)).bytes).toEqual(
    (await pdf(points, options, new AbortController().signal)).bytes,
  );
});
it('snapshots mutable geometry and settings before dynamic imports', async () => {
  const p = points.map(([x, y]) => [x, y] as [number, number]),
    o = { ...options };
  const pending = pdf(p, o);
  p[0]![0] = 0;
  o.heightMm = 30;
  expect((await pending).bytes).toEqual((await pdf(points, options)).bytes);
});
it('fits the maximum 150mm contour without scaling', () => {
  const result = layout(
    [
      [0, 0],
      [150, 0],
      [150, 150],
      [0, 150],
    ],
    options,
  );
  expect(result.width).toBe(150);
  expect(result.height).toBe(150);
});
it('returns no bytes for pre-cancellation or cancellation during yielding', async () => {
  const c = new AbortController();
  c.abort();
  expect((await pdf(points, options, c.signal)).bytes).toBeUndefined();
  const next = new AbortController();
  const pending = pdf(points, options, next.signal);
  const timer = setTimeout(() => next.abort(), 0);
  const result = await pending;
  clearTimeout(timer);
  expect(result.error).toContain('EXPORT_CANCELLED');
  expect(result.bytes).toBeUndefined();
});
it.each([
  { p: [] },
  {
    p: [
      [0, 0],
      [80, 0],
      [40, 80],
    ],
  },
  { p: Array.from({ length: 66 }, () => [0, 0]) },
])('rejects invalid geometry without partial files %#', async ({ p }) => {
  const result = await pdf(
    p.map(([x, y]): CutterPoint => [x!, y!]),
    options,
  );
  expect(result.ok).toBe(false);
  expect(result.bytes).toBeUndefined();
});
it('checks the current wall clearance and dimensions rather than a minimum-wall fallback', async () => {
  expect((await pdf(points, { ...options, wallMm: 10 })).ok).toBe(false);
  expect((await pdf(points, { ...options, heightMm: NaN })).ok).toBe(false);
});
