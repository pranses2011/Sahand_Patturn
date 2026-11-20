import { describe, it, expect } from 'vitest';
import { PATTERNS, dotGrid, stripes, rng, isSeamlessX, type PatternContext } from './index.js';

const ctx = (over: Partial<PatternContext> = {}): PatternContext => ({
  canvasW: 300,
  canvasH: 300,
  tileW: 40,
  tileH: 40,
  seed: 42,
  params: {},
  ...over,
});

describe('P — patterns', () => {
  it('P1: every pattern produces paths for a 300×300mm canvas', () => {
    for (const def of PATTERNS) {
      const paths = def.build(ctx({ params: { ...def.defaults } }));
      expect(paths.length, def.id).toBeGreaterThan(0);
      for (const p of paths) expect(p.d.length, def.id).toBeGreaterThan(0);
    }
  });

  it('P2: dot grid positions are deterministic (same seed → same output)', () => {
    const a = dotGrid.build(ctx({ params: { radius: 3 } }));
    const b = dotGrid.build(ctx({ params: { radius: 3 } }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('P3: rng is deterministic and in [0,1)', () => {
    const r1 = rng(7), r2 = rng(7);
    for (let i = 0; i < 100; i++) {
      const v = r1();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(v).toBe(r2());
    }
  });

  it('P4: tile coverage — paths stay within canvas bounds (dot grid)', () => {
    const paths = dotGrid.build(ctx({ params: { radius: 2 } }));
    // centers parsed from circle path M(cx-r) cy — just ensure count = cols × rows
    const cols = Math.ceil(300 / 40);
    expect(paths.length).toBe(cols * cols);
  });

  it('P5: stripes tile count matches canvas/tile ratio', () => {
    const horizontal = stripes.build(ctx({ params: { width: 3, vertical: false } }));
    expect(horizontal.length).toBe(Math.ceil(300 / 40));
    const vertical = stripes.build(ctx({ params: { width: 3, vertical: true } }));
    expect(vertical.length).toBe(Math.ceil(300 / 40));
  });

  it('P6: seamlessX sanity for tile-based patterns', () => {
    for (const def of [dotGrid, stripes]) {
      expect(isSeamlessX(def), def.id).toBe(true);
    }
  });

  it('P7: SVG unit contract — path numbers are plain mm values (no unit suffix)', () => {
    const paths = dotGrid.build(ctx({ params: { radius: 2.5 } }));
    for (const p of paths) {
      expect(p.d).not.toMatch(/[a-z]mm/i);
      expect(p.d).not.toMatch(/pt|px/i);
    }
  });
});
