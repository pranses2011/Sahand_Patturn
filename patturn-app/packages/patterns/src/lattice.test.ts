import { describe, expect, it } from 'vitest';
import { herringbone, kumiko, PATTERNS, type PatternContext } from './index.js';
const ctx = (size = 40): PatternContext => ({
  canvasW: size * 2,
  canvasH: size * 2,
  tileW: size,
  tileH: size,
  seed: 42,
  params: {},
});
const ns = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

describe('Herringbone and kumiko-inspired lattices', () => {
  it('registers exactly twelve unique base patterns', () => {
    expect(PATTERNS).toHaveLength(12);
    expect(new Set(PATTERNS.map((p) => p.id)).size).toBe(12);
  });
  it.each([herringbone, kumiko])(
    '$id produces deterministic finite geometry at supported sizes',
    (def) => {
      for (const size of [8, 40, 120]) {
        const c = ctx(size),
          before = JSON.stringify(c);
        const paths = def.build(c);
        expect(paths.length).toBeGreaterThan(0);
        expect(paths).toEqual(def.build(c));
        expect(JSON.stringify(c)).toBe(before);
        for (const path of paths) expect(path.d).not.toMatch(/NaN|Infinity/);
      }
    },
  );
  it('herringbone has two perpendicular domino orientations and equal polygon areas', () => {
    const orientations = new Set<string>();
    for (const p of herringbone.build(ctx())) {
      const a = ns(p.d);
      const dx = a[2]! - a[0]!,
        dy = a[3]! - a[1]!;
      orientations.add(`${dx},${dy}`);
      const ex = a[4]! - a[2]!,
        ey = a[5]! - a[3]!;
      expect(dx * ex + dy * ey).toBe(0);
      const ratio = Math.hypot(dx, dy) / Math.hypot(ex, ey);
      expect([0.5, 2]).toContain(ratio);
      let area = 0;
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        area += a[2 * i]! * a[2 * j + 1]! - a[2 * j]! * a[2 * i + 1]!;
      }
      expect(Math.abs(area) / 2).toBe(400);
    }
    expect(orientations).toEqual(new Set(['20,20', '10,10']));
  });
  it('herringbone covers interior points once with no holes or overlapping brick interiors', () => {
    const polygons = herringbone.build(ctx()).map((p) => ns(p.d));
    for (let x = 1.37; x < 80; x += 3.73)
      for (let y = 2.19; y < 80; y += 4.17) {
        const count = polygons.filter((a) => {
          let inside = false;
          for (let i = 0, j = 3; i < 4; j = i++) {
            const xi = a[2 * i]!,
              yi = a[2 * i + 1]!,
              xj = a[2 * j]!,
              yj = a[2 * j + 1]!;
            if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
          }
          return inside;
        }).length;
        expect(count, `${x},${y}`).toBe(1);
      }
  });
  it('kumiko-inspired motif repeats with matching mid-edge and corner connections', () => {
    const paths = kumiko.build(ctx());
    expect(paths).toHaveLength(12);
    expect(paths[1]!.d).toBe('M20 0L40 20L20 40L0 20z');
    expect(paths[4]!.d).toBe('M60 0L80 20L60 40L40 20z');
    expect(paths[7]!.d).toBe('M20 40L40 60L20 80L0 60z');
  });
});
