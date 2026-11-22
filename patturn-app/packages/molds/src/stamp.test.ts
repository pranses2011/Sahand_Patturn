import { beforeAll, it, expect } from 'vitest';
import { initCsg, buildConvexStamp } from './csg.js';
import { validateMesh } from '@patturn/kernel';
beforeAll(async () => {
  await initCsg();
});
const options = { baseMm: 3, reliefMm: 2, minWidthMm: 1, mirror: true };
const rectangle = [
  [0, 0],
  [20, 0],
  [20, 10],
  [0, 10],
] as [number, number][];
it.each([true, false])('builds closed relief and backing, mirror=%s', (mirror) => {
  const contours = [rectangle],
    before = JSON.stringify(contours),
    mesh = buildConvexStamp(contours, { ...options, mirror });
  const report = validateMesh(mesh);
  expect(report.ok).toBe(true);
  expect(report.euler).toBe(2);
  expect(report.signedVolumeMm3).toBeCloseTo(26 * 16 * 3 + 20 * 10 * 2, 3);
  expect(JSON.stringify(contours)).toBe(before);
  const zs = Array.from(mesh.positions).filter((_, i) => i % 3 === 2);
  expect(Math.min(...zs)).toBe(0);
  expect(Math.max(...zs)).toBe(5);
});
it('mirrors asymmetric triangular relief without changing volume', () => {
  const p = [
    [
      [0, 0],
      [20, 0],
      [0, 10],
    ],
  ] as [number, number][][];
  const a = buildConvexStamp(p, options),
    b = buildConvexStamp(p, { ...options, mirror: false });
  expect(validateMesh(a).signedVolumeMm3).toBeCloseTo(validateMesh(b).signedVolumeMm3, 3);
  expect(a.positions).not.toEqual(b.positions);
});
it.each([
  [
    [
      [0, 0],
      [0.5, 0],
      [0.5, 10],
      [0, 10],
    ],
  ],
  [
    [
      [0, 0],
      [10, 0],
      [3, 3],
      [10, 10],
      [0, 10],
    ],
  ],
  [
    rectangle,
    [
      [5, 2],
      [8, 2],
      [8, 5],
      [5, 5],
    ],
  ],
  [
    [
      [0, 0],
      [NaN, 10],
      [10, 0],
    ],
  ],
  [],
] as [number, number][][][])(
  'rejects thin/concave/nested/nonfinite/empty input %j',
  (...contours) => {
    expect(() => buildConvexStamp(contours, options)).toThrow();
  },
);
it('rejects invalid dimensions and permits disjoint convex shapes', () => {
  expect(() => buildConvexStamp([rectangle], { ...options, reliefMm: 0 })).toThrow();
  expect(
    validateMesh(buildConvexStamp([rectangle, rectangle.map(([x, y]) => [x + 30, y])], options)).ok,
  ).toBe(true);
});
