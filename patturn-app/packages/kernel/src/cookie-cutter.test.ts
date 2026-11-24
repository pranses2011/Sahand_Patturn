import { expect, it } from 'vitest';
import {
  buildCircularCutter,
  circularCutterProfile,
  type CircularCutterOptions,
} from './cookie-cutter.js';
import { validateMesh } from './mesh-validate.js';
const defaults = { diameterMm: 60, heightMm: 20, wallMm: 1.6, tipMm: 0.6 };
it.each([24, 96, 128, 256])(
  'builds a closed genus-one ring with analytic volume at %i facets',
  (segments) => {
    const options = { ...defaults, segments };
    const mesh = buildCircularCutter(options),
      report = validateMesh(mesh);
    expect(report.ok).toBe(true);
    expect(report.euler).toBe(0);
    expect(report.openEdges).toBe(0);
    const r = 30,
      a = r + 0.6,
      b = r + 1.6;
    const circular =
      Math.PI *
      (a * a + a * b + b * b - 3 * r * r + (20 - 6) * (b * b - r * r) + 3 * ((b + 3) ** 2 - r * r));
    const polygon = (circular * segments * Math.sin((2 * Math.PI) / segments)) / (2 * Math.PI);
    expect(report.signedVolumeMm3).toBeCloseTo(polygon, 1);
    expect(mesh.positions).toEqual(buildCircularCutter(options).positions);
    expect(mesh.indices).toEqual(buildCircularCutter(options).indices);
  },
);
it.each([
  { diameterMm: 20, heightMm: 10, wallMm: 0.8, tipMm: 0.4 },
  { diameterMm: 150, heightMm: 40, wallMm: 3, tipMm: 1.2 },
  { wallMm: 0.8, tipMm: 0.8 },
])('keeps bounds and constant-wall cases valid: %j', (override) => {
  const options = { ...defaults, ...override };
  const mesh = buildCircularCutter(options);
  expect(validateMesh(mesh).ok).toBe(true);
  const ys = Array.from(mesh.positions).filter((_, i) => i % 3 === 1);
  expect(Math.min(...ys)).toBe(0);
  expect(Math.max(...ys)).toBe(options.heightMm);
  expect(circularCutterProfile(options).minimumOpeningMm).toBeLessThan(options.diameterMm);
});
it.each([
  { diameterMm: NaN },
  { diameterMm: 19 },
  { diameterMm: 151 },
  { heightMm: Infinity },
  { heightMm: 9 },
  { heightMm: 41 },
  { wallMm: 0.7 },
  { wallMm: 3.1 },
  { tipMm: 0.3 },
  { tipMm: 1.3 },
  { wallMm: 0.8, tipMm: 1 },
  { segments: 23 },
  { segments: 257 },
  { segments: 24.5 },
])('rejects invalid options before meshing: %j', (override) => {
  expect(() => buildCircularCutter({ ...defaults, ...override } as CircularCutterOptions)).toThrow(
    'CUTTER_INVALID',
  );
});
