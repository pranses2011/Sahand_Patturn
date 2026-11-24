import { describe, expect, it } from 'vitest';
import { extruderLayout, type ExtruderOptions } from './extruder.js';
const options: ExtruderOptions = {
  diameterMm: 60,
  thicknessMm: 8,
  holeDiameterMm: 8,
  count: 6,
  orbitRadiusMm: 16,
};
describe('Conservative circular extruder clearance', () => {
  it.each([1, 2, 3, 6, 12])('bounds rim and every hole pair at count %s', (count) => {
    const layout = extruderLayout({ ...options, count, holeDiameterMm: 4 });
    expect(layout.contours).toHaveLength(count + 1);
    expect(layout.minWebMm).toBeGreaterThanOrEqual(1.5);
    for (const hole of layout.holes) {
      for (const vertex of layout.contours[0]!) {
        // Distance to vertices is not the rim proof; the inscribed-circle bound is.
        expect(Math.hypot(vertex[0], vertex[1])).toBeCloseTo(30, 10);
      }
      expect(
        30 * Math.cos(Math.PI / 128) - Math.hypot(hole.x, hole.y) - hole.radius,
      ).toBeGreaterThanOrEqual(layout.minWebMm);
    }
    for (let i = 0; i < count; i++)
      for (let j = i + 1; j < count; j++) {
        const a = layout.holes[i]!,
          b = layout.holes[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius).toBeGreaterThanOrEqual(
          layout.minWebMm,
        );
      }
  });
  it('places a single hole centrally and preserves deterministic caller parameters', () => {
    const input = { ...options, count: 1 };
    const before = { ...input };
    expect(extruderLayout(input).holes[0]).toEqual({ x: 0, y: 0, radius: 4 });
    expect(extruderLayout(input)).toEqual(extruderLayout(input));
    expect(input).toEqual(before);
  });
  it.each([
    { diameterMm: 29 },
    { diameterMm: 151 },
    { diameterMm: NaN },
    { thicknessMm: 2 },
    { thicknessMm: 21 },
    { thicknessMm: Infinity },
    { holeDiameterMm: 1 },
    { holeDiameterMm: 41 },
    { count: 0 },
    { count: 13 },
    { count: 1.5 },
    { orbitRadiusMm: -1 },
    { orbitRadiusMm: 61 },
    { orbitRadiusMm: NaN },
  ])('rejects invalid parameters %j', (override) => {
    expect(() => extruderLayout({ ...options, ...override })).toThrow('EXTRUDER_INVALID_OPTIONS');
  });
  it.each([{ orbitRadiusMm: 0 }, { orbitRadiusMm: 25 }, { holeDiameterMm: 16 }])(
    'rejects thin rim or inter-hole stock %j',
    (override) => {
      expect(() => extruderLayout({ ...options, ...override })).toThrow('EXTRUDER_WEB_TOO_THIN');
    },
  );
  it('does not accept nominal rim clearance when polygon facets reduce it below the minimum', () => {
    expect(() =>
      extruderLayout({ ...options, count: 1, diameterMm: 30, holeDiameterMm: 27 }),
    ).toThrow('EXTRUDER_WEB_TOO_THIN');
  });
});
