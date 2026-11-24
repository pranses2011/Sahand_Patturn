import { beforeAll, expect, it } from 'vitest';
import { initCsg, buildExtruderDie } from './csg.js';
import { extruderLayout, validateMesh } from '@patturn/kernel';
beforeAll(async () => {
  await initCsg();
});
it.each([1, 3, 6, 12])(
  'extrudes a closed plate with %s real through-holes and expected volume',
  (count) => {
    const options = { diameterMm: 60, thicknessMm: 8, holeDiameterMm: 4, count, orbitRadiusMm: 16 };
    const mesh = buildExtruderDie(options),
      report = validateMesh(mesh);
    expect(report.ok, report.problems.join(',')).toBe(true);
    expect(report.openEdges).toBe(0);
    expect(report.euler).toBe(2 - 2 * count);
    const area = (n: number, r: number) => (n / 2) * r * r * Math.sin((2 * Math.PI) / n);
    expect(report.signedVolumeMm3).toBeCloseTo((area(128, 30) - count * area(64, 2)) * 8, 1);
    const zs = Array.from(mesh.positions).filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBe(0);
    expect(Math.max(...zs)).toBe(8);
    expect(extruderLayout(options).minWebMm).toBeGreaterThanOrEqual(1.5);
  },
);
it('is deterministic and does not modify options', () => {
  const options = {
    diameterMm: 60,
    thicknessMm: 8,
    holeDiameterMm: 8,
    count: 6,
    orbitRadiusMm: 16,
  };
  const before = { ...options };
  expect(buildExtruderDie(options)).toEqual(buildExtruderDie(options));
  expect(options).toEqual(before);
});
it('rejects insufficient web before any extrusion', () => {
  expect(() =>
    buildExtruderDie({
      diameterMm: 30,
      thicknessMm: 8,
      holeDiameterMm: 25,
      count: 6,
      orbitRadiusMm: 16,
    }),
  ).toThrow('EXTRUDER_WEB_TOO_THIN');
});

it.each([1, 6, 12].flatMap((count) => [3, 12].map((flangeWidthMm) => ({ count, flangeWidthMm }))))(
  'fuses a collar with through-holes and exact stepped volume %#',
  ({ count, flangeWidthMm }) => {
    const options = {
      diameterMm: 60,
      thicknessMm: 8,
      holeDiameterMm: 4,
      count,
      orbitRadiusMm: 16,
      flangeWidthMm,
    };
    const mesh = buildExtruderDie(options),
      report = validateMesh(mesh);
    expect(report.ok, report.problems.join(',')).toBe(true);
    expect(report.euler).toBe(2 - 2 * count);
    expect(report.openEdges).toBe(0);
    const area = (n: number, r: number) => (n / 2) * r * r * Math.sin((2 * Math.PI) / n);
    const expected =
      (area(128, 30) - count * area(64, 2)) * 8 +
      (area(128, 30 + flangeWidthMm) - count * area(64, 2)) * 4;
    expect(Math.abs(report.signedVolumeMm3 - expected) / expected).toBeLessThan(1e-6);
    const xs = Array.from(mesh.positions).filter((_, i) => i % 3 === 0),
      zs = Array.from(mesh.positions).filter((_, i) => i % 3 === 2);
    expect(Math.min(...xs)).toBeCloseTo(-30 - flangeWidthMm, 5);
    expect(Math.max(...xs)).toBeCloseTo(30 + flangeWidthMm, 5);
    expect(Math.min(...zs)).toBe(0);
    expect(Math.max(...zs)).toBe(12);
  },
);
it('preserves plain-plate bytes when the optional collar is disabled', () => {
  const options = {
    diameterMm: 60,
    thicknessMm: 8,
    holeDiameterMm: 4,
    count: 6,
    orbitRadiusMm: 16,
  };
  expect(buildExtruderDie({ ...options, flangeWidthMm: 0 })).toEqual(buildExtruderDie(options));
});
