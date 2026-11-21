import { describe, expect, it } from 'vitest';
import { flattenCubic, segmentDistance, type Point2 } from './bezier.js';
import { toDxf } from './index.js';
import { PATTERNS } from '@patturn/patterns';
const a: Point2 = [0, 20],
  b: Point2 = [10, -30],
  c: Point2 = [30, 70],
  d: Point2 = [40, 20];
describe('Tolerance-controlled cubic approximation', () => {
  it('bounds dense curve samples by the chosen model-space tolerance', () => {
    const line = flattenCubic(a, b, c, d, 0.05);
    expect(line[0]).toEqual(a);
    expect(line.at(-1)).toEqual(d);
    for (let i = 0; i <= 1000; i++) {
      const t = i / 1000,
        u = 1 - t;
      const p: Point2 = [0, 1].map(
        (axis) =>
          u * u * u * a[axis]! +
          3 * u * u * t * b[axis]! +
          3 * u * t * t * c[axis]! +
          t * t * t * d[axis]!,
      ) as Point2;
      const distance = Math.min(
        ...line.slice(1).map((end, j) => segmentDistance(p, line[j]!, end)),
      );
      expect(distance).toBeLessThanOrEqual(0.05 + 1e-10);
    }
  });
  it('tightening tolerance refines deterministically; collinear overshoot is not discarded', () => {
    expect(flattenCubic(a, b, c, d, 0.01).length).toBeGreaterThan(
      flattenCubic(a, b, c, d, 0.1).length,
    );
    expect(flattenCubic(a, b, c, d, 0.05)).toEqual(flattenCubic(a, b, c, d, 0.05));
    const loop = flattenCubic([0, 0], [100, 0], [-100, 0], [0, 0], 0.05);
    expect(loop.length).toBeGreaterThan(3);
    expect(Math.max(...loop.map((p) => p[0]))).toBeGreaterThan(20);
  });
  it('rejects invalid tolerance, nonfinite data and unbounded coordinates', () => {
    for (const t of [0, NaN, Infinity, 0.00001, 2])
      expect(() => flattenCubic(a, b, c, d, t)).toThrow();
    expect(() => flattenCubic([Infinity, 0], b, c, d, 0.05)).toThrow();
    expect(() => flattenCubic([1e8, 0], b, c, d, 0.05)).toThrow();
  });
  it('requires explicit opt-in, supports relative cubics, and records approximation in DXF', () => {
    const absolute = 'M0 20C10 -30 30 70 40 20',
      relative = 'M0 20c10 -50 30 50 40 0';
    expect(toDxf([{ d: absolute }]).ok).toBe(false);
    const r = toDxf([{ d: absolute }], undefined, { bezierToleranceMm: 0.05 });
    expect(r.ok).toBe(true);
    expect(r.bytes).toEqual(toDxf([{ d: relative }], undefined, { bezierToleranceMm: 0.05 }).bytes);
    expect(new TextDecoder().decode(r.bytes)).toContain('tolerance 0.05 mm before canvas clipping');
  });
  it('exports all twelve library patterns with explicit approximation enabled', () => {
    for (const pattern of PATTERNS) {
      const paths = pattern.build({
        canvasW: 80,
        canvasH: 80,
        tileW: 40,
        tileH: 40,
        seed: 42,
        params: { ...pattern.defaults },
      });
      expect(
        toDxf(paths, { width: 80, height: 80 }, { bezierToleranceMm: 0.05 }).ok,
        pattern.id,
      ).toBe(true);
    }
  });
});
