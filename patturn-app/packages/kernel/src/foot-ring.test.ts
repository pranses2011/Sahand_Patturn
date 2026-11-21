import { describe, expect, it } from 'vitest';
import { buildFootRing, type FootRingOptions } from './foot-ring.js';
import { validateMesh } from './mesh-validate.js';
const defaults: FootRingOptions = {
  outerRadius: 34,
  width: 6,
  depth: 4,
  floorY: 0,
  edge: 'square',
};
describe('Closed foot-ring addition', () => {
  const cases = (['square', 'chamfer', 'round'] as const).flatMap((edge) =>
    [2, 6, 12].flatMap((width) => [2, 4, 15].map((depth) => ({ ...defaults, edge, width, depth }))),
  );
  it.each(cases)('has closed outward geometry and correct bounds for %j', (options) => {
    const mesh = buildFootRing(options),
      report = validateMesh(mesh);
    expect(report.ok).toBe(true);
    expect(report.euler).toBe(0);
    const ys = Array.from(mesh.positions).filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeCloseTo(-options.depth, 5);
    expect(Math.max(...ys)).toBe(0.5);
    if (options.edge === 'square') {
      const exact = Math.PI * (34 ** 2 - (34 - options.width) ** 2) * (options.depth + 0.5);
      const factor = (96 * Math.sin((2 * Math.PI) / 96)) / (2 * Math.PI);
      expect(Math.abs(report.signedVolumeMm3 - exact * factor) / exact).toBeLessThan(1e-6);
    }
  });
  it.each([
    { width: 0 },
    { width: 13 },
    { depth: 16 },
    { outerRadius: NaN },
    { outerRadius: 10, width: 12 },
    { floorY: Infinity },
    { segments: 23 },
    { edge: 'invalid' },
  ])('rejects invalid dimensions %j', (override) => {
    expect(() => buildFootRing({ ...defaults, ...override } as FootRingOptions)).toThrow(
      'INVALID_FOOT_RING',
    );
  });
  it('is deterministic and uses a smaller volume for bevelled edges', () => {
    const square = buildFootRing(defaults);
    expect(square).toEqual(buildFootRing(defaults));
    for (const edge of ['round', 'chamfer'] as const)
      expect(validateMesh(buildFootRing({ ...defaults, edge })).signedVolumeMm3).toBeLessThan(
        validateMesh(square).signedVolumeMm3,
      );
  });
});
