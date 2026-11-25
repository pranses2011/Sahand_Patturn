import { expect, it } from 'vitest';
import { moveOrthogonalVertex, openOrthogonalContour } from './orthogonal-vertex';
import { validateMesh, buildOrthogonalCutter, type CutterPoint } from '@patturn/kernel';
const l: CutterPoint[] = [
  [0, 0],
  [80, 0],
  [80, 30],
  [30, 30],
  [30, 80],
  [0, 80],
];
const options = { heightMm: 20, wallMm: 1.6, tipMm: 0.6 };
it('moves a reflex corner by sliding its two neighbors on the shared axes without mutating the input', () => {
  const before = JSON.stringify(l);
  const result = moveOrthogonalVertex(l, 3, 40.25, 40.5, options);
  expect(result).toEqual([
    [0, 0],
    [80, 0],
    [80, 40.5],
    [40.25, 40.5],
    [40.25, 80],
    [0, 80],
  ]);
  expect(JSON.stringify(l)).toBe(before);
  expect(validateMesh(buildOrthogonalCutter(result, options)).ok).toBe(true);
});
it.each([0, 1, 2, 3, 4, 5])(
  'preserves axis alignment and positive closed mesh for moved corner %j',
  (index) => {
    const p = l[index]!;
    const result = moveOrthogonalVertex(l, index, p[0] + 1, p[1] + 1, options);
    result.forEach((point, i) => {
      const next = result[(i + 1) % result.length]!;
      expect((point[0] === next[0]) !== (point[1] === next[1])).toBe(true);
    });
    expect(validateMesh(buildOrthogonalCutter(result, options)).ok).toBe(true);
  },
);
it('can widen a contour that is invalid under the current grip width', () => {
  const notch: CutterPoint[] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [58, 100],
    [58, 40],
    [42, 40],
    [42, 100],
    [0, 100],
  ];
  const result = moveOrthogonalVertex(notch, 4, 64, 40, { ...options, wallMm: 3 });
  expect(validateMesh(buildOrthogonalCutter(result, { ...options, wallMm: 3 })).ok).toBe(true);
});
it.each([
  { i: -1, x: 40, y: 40 },
  { i: 6, x: 40, y: 40 },
  { i: 1.5, x: 40, y: 40 },
  { i: 3, x: NaN, y: 40 },
  { i: 3, x: 40, y: Infinity },
  { i: 3, x: 1001, y: 40 },
  { i: 3, x: 75, y: 75 },
  { i: 3, x: 80, y: 30 },
  { i: 0, x: -200, y: 0 },
])(
  'rejects unsupported coordinates, collapse or insufficient clearance without changing input %#',
  ({ i, x, y }) => {
    const before = JSON.stringify(l);
    expect(() => moveOrthogonalVertex(l, i, x, y, options)).toThrow();
    expect(JSON.stringify(l)).toBe(before);
  },
);
it('strips only the optional closing vertex and returns independent copies', () => {
  const closed = [...l, l[0]!];
  const result = openOrthogonalContour(closed);
  expect(result).toEqual(l);
  expect(result[0]).not.toBe(l[0]);
  expect(() => moveOrthogonalVertex(closed, 0, 1, 1, options)).toThrow('CLOSED_DUPLICATE');
  expect(openOrthogonalContour([])).toEqual([]);
});
