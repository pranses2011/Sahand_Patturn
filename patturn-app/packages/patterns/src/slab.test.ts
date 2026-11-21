import { describe, it, expect } from 'vitest';
import { buildSlab } from './slab.js';
describe('exact conical neutral-surface development', () => {
  it.each([
    [40, 40, 100],
    [40, 60, 100],
    [60, 40, 100],
    [10, 150, 10],
    [150, 10, 300],
    [40, 40.0001, 100],
    [40, 40.00000001, 100],
  ])('preserves slant and both circumferences for %j', (b, t, h) => {
    const options = { bottomRadius: b!, topRadius: t!, height: h!, guides: 8 };
    const out = buildSlab(options);
    expect(out).toEqual(buildSlab(options));
    expect(out.paths).toHaveLength(8);
    expect(out.distortion).toBe(0);
    const slant = Math.hypot(h!, b! - t!);
    expect(out.slant).toBe(slant);
    if (b === t) {
      expect(out.width).toBeCloseTo(2 * Math.PI * b!, 9);
      expect(out.height).toBe(h);
    } else {
      const outer = (slant * Math.max(b!, t!)) / Math.abs(b! - t!);
      expect(outer * out.angle).toBeCloseTo(2 * Math.PI * Math.max(b!, t!), 8);
    }
    for (const path of out.paths) {
      const coords = path.d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      for (let i = 0; i < coords.length; i += 2) {
        expect(coords[i]).toBeGreaterThanOrEqual(-1e-6);
        expect(coords[i]).toBeLessThanOrEqual(out.width + 1e-6);
        expect(coords[i + 1]).toBeGreaterThanOrEqual(-1e-6);
        expect(coords[i + 1]).toBeLessThanOrEqual(out.height + 1e-6);
      }
    }
  });
  it.each([
    { bottomRadius: 0 },
    { topRadius: 151 },
    { height: NaN },
    { height: 301 },
    { guides: 1 },
    { guides: 2.5 },
  ])('rejects invalid input %j', (override) => {
    expect(() =>
      buildSlab({ bottomRadius: 40, topRadius: 60, height: 100, guides: 8, ...override }),
    ).toThrow('INVALID_SLAB');
  });
});
