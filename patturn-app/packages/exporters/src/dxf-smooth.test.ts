import { describe, it, expect } from 'vitest';
import DxfParser from 'dxf-parser';
import { toDxf } from './index.js';
import { segmentDistance, type Point2 } from './bezier.js';
function entities(d: string) {
  const out = toDxf([{ d }], { width: 100, height: 100 }, { bezierToleranceMm: 0.05 });
  expect(out.ok, out.error).toBe(true);
  return new DxfParser().parseSync(new TextDecoder().decode(out.bytes))!.entities;
}
function text(d: string) {
  const out = toDxf([{ d }], undefined, { bezierToleranceMm: 0.05 });
  expect(out.ok, out.error).toBe(true);
  return new TextDecoder().decode(out.bytes);
}
describe('Quadratic and smooth SVG curves in DXF', () => {
  it('preserves quadratic endpoints with sampled error inside the explicit tolerance', () => {
    const lines = entities('M0 0 Q20 40 40 0') as unknown as {
      type: string;
      vertices: { x: number; y: number }[];
    }[];
    expect(lines.every((item) => item.type === 'LINE')).toBe(true);
    expect(lines[0]!.vertices[0]).toMatchObject({ x: 0, y: 0 });
    expect(lines.at(-1)!.vertices[1]).toMatchObject({ x: 40, y: 0 });
    for (let i = 0; i <= 400; i++) {
      const t = i / 400,
        p: Point2 = [40 * t, 80 * t * (1 - t)];
      const distance = Math.min(
        ...lines.map((line) =>
          segmentDistance(
            p,
            [line.vertices[0]!.x, line.vertices[0]!.y],
            [line.vertices[1]!.x, line.vertices[1]!.y],
          ),
        ),
      );
      expect(distance).toBeLessThanOrEqual(0.05 + 1e-8);
    }
  });
  it.each([
    ['M0 0 Q10 20 20 0 T40 0', 'M0 0 Q10 20 20 0 Q30 -20 40 0'],
    ['M0 0 q10 20 20 0 t20 0', 'M0 0 Q10 20 20 0 Q30 -20 40 0'],
    ['M0 0 C5 20 15 20 20 0 S35 -20 40 0', 'M0 0 C5 20 15 20 20 0 C25 -20 35 -20 40 0'],
    ['M0 0 c5 20 15 20 20 0 s15 -20 20 0', 'M0 0 C5 20 15 20 20 0 C25 -20 35 -20 40 0'],
    ['M0 0 L10 10 T20 20', 'M0 0 L10 10 Q10 10 20 20'],
    ['M0 0 Q5 10 10 0 L20 0 T30 0', 'M0 0 Q5 10 10 0 L20 0 Q20 0 30 0'],
    ['M0 0 Q5 10 10 0 S15 10 20 0', 'M0 0 Q5 10 10 0 C10 0 15 10 20 0'],
    ['M0 0 C5 10 5 10 10 0 T20 0', 'M0 0 C5 10 5 10 10 0 Q10 0 20 0'],
    ['M0 0 Q5 10 10 0 15 -10 20 0', 'M0 0 Q5 10 10 0 Q15 -10 20 0'],
    ['M0 0 Q5 10 10 0 M30 0 T40 0', 'M0 0 Q5 10 10 0 M30 0 Q30 0 40 0'],
  ])('matches explicit controls: %s', (smooth, explicit) => {
    expect(text(smooth!)).toBe(text(explicit!));
  });
  it.each(['M0 0 Q1 2', 'M0 0 T', 'M0 0 S1 2 3', 'M0 0 QNaN 0 10 10'])(
    'rejects malformed paths atomically: %s',
    (d) => {
      const out = toDxf([{ d: 'M0 0 L1 1' }, { d }], undefined, { bezierToleranceMm: 0.05 });
      expect(out.ok).toBe(false);
      expect(out.bytes).toBeUndefined();
    },
  );
  it.each(['M0 0 Q10 20 20 0', 'M0 0 T20 0', 'M0 0 S10 20 20 0'])(
    'requires explicit tolerance: %s',
    (d) => {
      expect(toDxf([{ d }]).ok).toBe(false);
    },
  );
  it('clips flattened quadratic geometry inside the declared canvas without inventing a closing edge', () => {
    const out = toDxf(
      [{ d: 'M-10 0 Q20 80 50 0' }],
      { width: 40, height: 20 },
      { bezierToleranceMm: 0.05 },
    );
    expect(out.ok, out.error).toBe(true);
    const doc = new DxfParser().parseSync(new TextDecoder().decode(out.bytes))!;
    for (const item of doc.entities as unknown as { vertices: { x: number; y: number }[] }[])
      for (const p of item.vertices) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-8);
        expect(p.x).toBeLessThanOrEqual(40 + 1e-8);
        expect(p.y).toBeGreaterThanOrEqual(-1e-8);
        expect(p.y).toBeLessThanOrEqual(20 + 1e-8);
      }
  });
});
