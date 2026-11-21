import { describe, expect, it } from 'vitest';
import { spiral, seigaiha, PATTERNS, type PatternContext } from './index.js';
const ctx = (size = 40): PatternContext => ({ canvasW: size * 2, canvasH: size * 2, tileW: size, tileH: size, seed: 42, params: {} });
const ns = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

describe('Spiral and Japanese wave patterns', () => {
  it.each([spiral, seigaiha])('$id has a unique ID and finite deterministic paths without mutating input', (def) => {
    expect(PATTERNS.filter((p) => p.id === def.id)).toHaveLength(1);
    for (const size of [8, 40, 120]) {
      const c = ctx(size), before = JSON.stringify(c);
      const paths = def.build(c);
      expect(paths).toEqual(def.build(c));
      expect(paths.length).toBeGreaterThan(0);
      expect(JSON.stringify(c)).toBe(before);
      for (const p of paths) {
        expect(p.d).not.toMatch(/NaN|Infinity/);
        expect(p.fill).toBe(false);
      }
    }
  });
  it('spiral stays within each tile and adjacent cells are exact translations', () => {
    const paths = spiral.build(ctx());
    expect(paths).toHaveLength(4);
    const a = ns(paths[0]!.d), b = ns(paths[1]!.d), c = ns(paths[2]!.d);
    expect(a).toHaveLength(194); // center + 96 samples
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toBeGreaterThanOrEqual(0);
      expect(a[i]).toBeLessThanOrEqual(40);
      expect(b[i]! - a[i]!).toBeCloseTo(i % 2 ? 0 : 40, 3);
      expect(c[i]! - a[i]!).toBeCloseTo(i % 2 ? 40 : 0, 3);
    }
  });
  it('fans have three nested elliptical arcs per center with half-tile stagger', () => {
    const paths = seigaiha.build(ctx());
    expect(paths).toHaveLength(60); // 5 rows × 4 centers × 3 arcs
    const a = ns(paths[0]!.d), next = ns(paths[3]!.d), row = ns(paths[12]!.d);
    expect(a).toEqual([-60, 20, 20, 20, 0, 0, 1, -20, 20]);
    expect(next[0]! - a[0]!).toBe(40);
    expect(row[0]! - a[0]!).toBe(20);
    expect(row[1]! - a[1]!).toBe(20);
    expect(ns(paths[1]!.d)[2]).toBeLessThan(a[2]!);
    expect(ns(paths[2]!.d)[2]).toBeLessThan(ns(paths[1]!.d)[2]!);
  });
  it('fan geometry repeats after one full vertical tile, including overdraw outside canvas', () => {
    const paths = seigaiha.build(ctx());
    for (let i = 0; i < 12; i++) {
      const a = ns(paths[i]!.d), b = ns(paths[i + 24]!.d);
      expect(b[0]).toBe(a[0]); expect(b[7]).toBe(a[7]);
      expect(b[1]! - a[1]!).toBe(40); expect(b[8]! - a[8]!).toBe(40);
      expect(b.slice(2, 7)).toEqual(a.slice(2, 7));
    }
  });
});
