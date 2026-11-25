import { expect, it } from 'vitest';
import { snapshotTracedOrthogonalCutter as snapshot } from './traced-cutter';
import { buildOrthogonalCutter, validateMesh, type CutterPoint } from '@patturn/kernel';
const l: CutterPoint[] = [
  [10.125, 20.25],
  [90.125, 20.25],
  [90.125, 50.25],
  [40.125, 50.25],
  [40.125, 80.25],
  [10.125, 80.25],
];
const options = { heightMm: 24, wallMm: 2, tipMm: 0.8 };
it('copies exact source coordinates and current settings into a detached independent file', () => {
  const result = snapshot([l], options);
  expect(result).toEqual({
    format: 'patturn-orthogonal-cutter',
    version: 1,
    units: 'mm',
    ...options,
    points: l,
  });
  expect(result.points).not.toBe(l);
  expect(result.points[0]).not.toBe(l[0]);
  expect(validateMesh(buildOrthogonalCutter(result.points, result)).ok).toBe(true);
  result.points[0] = [0, 0];
  expect(l[0]![0]).toBe(10.125);
});
it('is deterministic and preserves reversed winding rather than silently normalizing the source', () => {
  expect(snapshot([[...l].reverse()], options).points).toEqual([...l].reverse());
  expect(snapshot([l], options)).toEqual(snapshot([l], options));
});
it.each([{ contours: [] }, { contours: [l, l] }])(
  'rejects empty or multiple contours %#',
  ({ contours }) => {
    expect(() => snapshot(contours, options)).toThrow('SINGLE_CONTOUR');
  },
);
it('rejects diagonals and current dimensions that fail clearance', () => {
  expect(() =>
    snapshot(
      [
        [
          [0, 0],
          [80, 0],
          [40, 80],
        ],
      ],
      options,
    ),
  ).toThrow();
  expect(() => snapshot([l], { ...options, wallMm: 10 })).toThrow();
  expect(() => snapshot([l], { ...options, heightMm: NaN })).toThrow();
});
