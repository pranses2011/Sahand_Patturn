import { describe, expect, it } from 'vitest';
import { buildChuck, CHUCK_TAPER_DEG } from './chuck.js';
import { validateMesh } from './mesh-validate.js';
const defaults = { baseDiameter: 80, height: 40, drainDiameter: 8 };
describe('Tapered annular chuck geometry', () => {
  const cases = [40, 80, 200].flatMap((baseDiameter) =>
    [10, 40, 100].flatMap((height) =>
      [4, 8, 20].map((drainDiameter) => ({ baseDiameter, height, drainDiameter })),
    ),
  );
  it.each(cases)('is closed, outward and has an unobstructed axial hole for %j', (options) => {
    const mesh = buildChuck(options),
      report = validateMesh(mesh);
    expect(report.ok).toBe(true);
    expect(report.openEdges).toBe(0);
    expect(report.euler).toBe(0);
    expect(report.degenerateTris).toBe(0);
    expect(report.duplicateTris).toBe(0);
    const base = options.baseDiameter / 2,
      top = base - options.height * Math.tan((CHUCK_TAPER_DEG * Math.PI) / 180),
      hole = options.drainDiameter / 2;
    const exact =
      Math.PI * options.height * ((base * base + base * top + top * top) / 3 - hole * hole);
    const polygonFactor = (96 * Math.sin((2 * Math.PI) / 96)) / (2 * Math.PI);
    expect(Math.abs(report.signedVolumeMm3 - exact * polygonFactor) / exact).toBeLessThan(1e-6);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const radius = Math.hypot(mesh.positions[i]!, mesh.positions[i + 2]!);
      expect(radius).toBeGreaterThanOrEqual(hole - 1e-5);
      expect([0, options.height]).toContain(mesh.positions[i + 1]);
    }
  });
  it.each([
    { baseDiameter: NaN },
    { baseDiameter: 39 },
    { height: 101 },
    { height: 0 },
    { drainDiameter: 3 },
    { drainDiameter: Infinity },
    { segments: 23 },
    { segments: 256.5 },
  ])('rejects invalid dimensions before allocating %j', (override) => {
    expect(() => buildChuck({ ...defaults, ...override })).toThrow('INVALID_CHUCK_DIMENSIONS');
  });
  it('is deterministic with shared rings at supported tessellation bounds', () => {
    for (const segments of [24, 96, 256]) {
      const mesh = buildChuck({ ...defaults, segments });
      expect(mesh).toEqual(buildChuck({ ...defaults, segments }));
      expect(mesh.positions.length).toBe(4 * segments * 3);
      expect(mesh.indices.length).toBe(4 * segments * 6);
      expect(validateMesh(mesh).ok).toBe(true);
    }
  });
});
