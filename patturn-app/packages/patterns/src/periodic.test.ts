import { describe, expect, it } from 'vitest';
import { wave, diamond, PATTERNS, type PatternContext } from './index.js';
const ctx = (w = 40, h = 40): PatternContext => ({ canvasW: w, canvasH: h, tileW: w, tileH: h, seed: 42, params: {} });
const points = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

describe('Wave and diamond periodic geometry', () => {
  it.each([wave, diamond])('$id uses a unique stable ID and deterministic finite geometry', (def) => {
    expect(PATTERNS.filter((p) => p.id === def.id)).toHaveLength(1);
    for (const size of [8, 40, 120]) {
      const c = ctx(size, size / 2);
      const before = JSON.stringify(c);
      expect(def.build(c)).toEqual(def.build(c));
      expect(JSON.stringify(c)).toBe(before);
      for (const path of def.build(c)) {
        expect(path.fill).toBe(false);
        expect(path.d).not.toMatch(/NaN|Infinity/);
        const ns = points(path.d);
        ns.forEach((n, i) => expect(n).toBeGreaterThanOrEqual(0));
        ns.forEach((n, i) => expect(n).toBeLessThanOrEqual(i % 2 ? size / 2 : size));
      }
    }
  });
  it('wave endpoint and tangent agree across horizontal tile boundaries', () => {
    for (const size of [8, 40, 120]) {
      const c = ctx(size); c.canvasW = size * 2;
      const [a, b] = wave.build(c).map((p) => points(p.d));
      expect(a!.slice(-2)).toEqual(b!.slice(0, 2));
      // Last cubic control -> endpoint equals next start -> first control.
      expect(a![12]! - a![10]!).toBeCloseTo(b![2]! - b![0]!, 2);
      expect(a![13]! - a![11]!).toBeCloseTo(b![3]! - b![1]!, 2);
    }
  });
  it('diamond mid-edge vertices agree with right and lower neighbors', () => {
    const c = ctx(40, 24); c.canvasW = 80; c.canvasH = 48;
    const [a, right, lower] = diamond.build(c).map((p) => points(p.d));
    expect(a!.slice(2, 4)).toEqual(right!.slice(6, 8));
    expect(a!.slice(4, 6)).toEqual(lower!.slice(0, 2));
  });
  it.each([wave, diamond])('$id repeats over partial last tiles without gaps in cell generation', (def) => {
    expect(def.build({ ...ctx(), canvasW: 81, canvasH: 41 })).toHaveLength(6);
    expect(def.build({ ...ctx(), canvasW: 300, canvasH: 300 })).toHaveLength(64);
  });
});
