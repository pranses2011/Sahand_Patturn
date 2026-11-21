import { describe, it, expect } from 'vitest';
import { buildEllipseLoft, buildArcSweep } from './loft-sweep.js';
import { validateMesh } from './mesh-validate.js';
describe('Bounded two-profile loft and framed arc sweep', () => {
  it.each([0, 60, -100])(
    'lofts offset %s with exact polygon-corrected integrated volume',
    (offsetX) => {
      const opts = { bottomX: 30, bottomZ: 20, topX: 60, topZ: 40, height: 100, offsetX };
      const mesh = buildEllipseLoft(opts),
        report = validateMesh(mesh);
      expect(report.ok).toBe(true);
      expect(report.euler).toBe(2);
      expect(mesh).toEqual(buildEllipseLoft(opts));
      const exact = Math.PI * 100 * (30 * 20 + (30 * 20 + 30 * 20) / 2 + (30 * 20) / 3);
      const correction = (96 * Math.sin((2 * Math.PI) / 96)) / (2 * Math.PI);
      expect(report.signedVolumeMm3).toBeCloseTo(exact * correction, 0);
    },
  );
  it.each([15, 90, 180, 270])(
    'sweeps %s degrees with positive volume close to analytic tube volume',
    (angleDeg) => {
      const opts = { pathRadius: 60, tubeRadius: 8, angleDeg };
      const mesh = buildArcSweep(opts),
        report = validateMesh(mesh);
      expect(report.ok).toBe(true);
      expect(report.euler).toBe(2);
      expect(mesh).toEqual(buildArcSweep(opts));
      const exact = (Math.PI * 8 ** 2 * 60 * angleDeg * Math.PI) / 180;
      expect(Math.abs(report.signedVolumeMm3 / exact - 1)).toBeLessThan(0.003);
    },
  );
  it.each([{ bottomX: 0 }, { topZ: 101 }, { offsetX: Infinity }, { height: 0 }, { segments: 2.5 }])(
    'rejects invalid loft %j',
    (override) => {
      expect(() =>
        buildEllipseLoft({
          bottomX: 30,
          bottomZ: 20,
          topX: 40,
          topZ: 30,
          height: 100,
          offsetX: 0,
          ...override,
        }),
      ).toThrow('INVALID_LOFT');
    },
  );
  it.each([
    { tubeRadius: 30, pathRadius: 20 },
    { angleDeg: 360 },
    { angleDeg: NaN },
    { steps: 0 },
    { segments: 129 },
  ])('rejects folded or invalid sweep %j', (override) => {
    expect(() =>
      buildArcSweep({ pathRadius: 60, tubeRadius: 8, angleDeg: 180, ...override }),
    ).toThrow('INVALID_SWEEP');
  });
});
