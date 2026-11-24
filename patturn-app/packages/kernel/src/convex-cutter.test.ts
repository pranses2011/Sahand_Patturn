import { expect, it } from 'vitest';
import { buildConvexCutter, convexCutterProfile, type CutterPoint } from './convex-cutter.js';
import { validateMesh } from './mesh-validate.js';
const options = { heightMm: 20, wallMm: 1.6, tipMm: 0.6 };
const square: CutterPoint[] = [
  [0, 0],
  [40, 0],
  [40, 40],
  [0, 40],
];
it.each([square, [...square].reverse(), [...square, square[0]!]].map((points) => ({ points })))(
  'builds a closed positive genus-one polygonal cutter: %j',
  ({ points }) => {
    const mesh = buildConvexCutter(points, options),
      report = validateMesh(mesh);
    expect(report.ok).toBe(true);
    expect(report.euler).toBe(0);
    const area = (d: number) => (40 + 2 * d) ** 2 - 1600;
    const expected =
      ((area(0.6) + 4 * area(1.1) + area(1.6)) * 3) / 6 + 14 * area(1.6) + 3 * area(4.6);
    expect(report.signedVolumeMm3).toBeCloseTo(expected, 1);
    expect(mesh.positions).toEqual(buildConvexCutter(points, options).positions);
    expect(mesh.indices).toEqual(buildConvexCutter(points, options).indices);
  },
);
it.each(
  [
    [
      [0, 0],
      [40, 0],
      [20, 40],
    ],
    [
      [0, 0],
      [60, 0],
      [60, 30],
      [0, 30],
    ],
  ].map((points) => ({ points })),
)('supports bounded convex contours without capping the opening: %j', ({ points }) => {
  expect(validateMesh(buildConvexCutter(points as unknown as CutterPoint[], options)).ok).toBe(
    true,
  );
});
it.each(
  [
    [],
    [
      [0, 0],
      [40, 0],
    ],
    [
      [0, 0],
      [40, 0],
      [40, 40],
      [20, 20],
      [0, 40],
    ],
    [
      [0, 0],
      [40, 40],
      [0, 40],
      [40, 0],
    ],
    [
      [0, 0],
      [20, 0],
      [40, 0],
      [40, 40],
      [0, 40],
    ],
    [
      [0, 0],
      [40, 0],
      [40, 0],
      [0, 40],
    ],
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    [
      [0, 0],
      [151, 0],
      [151, 40],
      [0, 40],
    ],
    [
      [0, 0],
      [40, 0],
      [40, NaN],
    ],
    [
      [0, 0],
      [150, 0],
      [0, 20],
    ],
    Array.from({ length: 66 }, (_, i) => [40 * Math.cos(i), 40 * Math.sin(i)]),
  ].map((points) => ({ points })),
)('rejects invalid, concave, crossing, small or sharp contours: %j', ({ points }) => {
  expect(() => buildConvexCutter(points as unknown as CutterPoint[], options)).toThrow();
});
it('keeps a perpendicular offset of the requested width and centers physical coordinates', () => {
  const profile = convexCutterProfile(square, options);
  expect(profile.points).toEqual([
    [-20, -20],
    [20, -20],
    [20, 20],
    [-20, 20],
  ]);
  expect(profile.loops[1]!.points[0]).toEqual([-20.6, -20.6]);
  expect(() => buildConvexCutter(square, { ...options, tipMm: 1.6 })).toThrow();
});
