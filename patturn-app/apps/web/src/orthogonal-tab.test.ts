import { expect, it } from 'vitest';
import {
  addOrthogonalTab,
  removeOrthogonalTab,
  addOrthogonalNotch,
  removeOrthogonalNotch,
} from './orthogonal-notch';
import { buildOrthogonalCutter, validateMesh, type CutterPoint } from '@patturn/kernel';
const square: CutterPoint[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];
const options = { heightMm: 20, wallMm: 1.6, tipMm: 0.6 };
it.each([0, 1, 2, 3])(
  'adds and removes an outward tab on edge %j in either winding without mutation',
  (edge) => {
    for (const points of [square, [...square].reverse()]) {
      const before = JSON.stringify(points);
      const result = addOrthogonalTab(points, edge, 20, 20, 14, options);
      expect(result).toHaveLength(8);
      expect(validateMesh(buildOrthogonalCutter(result, options)).ok).toBe(true);
      expect(removeOrthogonalTab(result, edge + 1, options)).toEqual(points);
      expect(JSON.stringify(points)).toBe(before);
      expect(() => removeOrthogonalNotch(result, edge + 1, options)).toThrow('REQUIRE_INWARD');
    }
  },
);
it('preserves fractional dimensions, deterministic output and seam-spanning removal', () => {
  const result = addOrthogonalTab(square, 3, 20.25, 20.5, 14.125, options);
  expect(result[5]).toEqual([-14.125, 79.75]);
  expect(addOrthogonalTab(square, 3, 20.25, 20.5, 14.125, options)).toEqual(result);
  const shifted = [...result.slice(5), ...result.slice(0, 5)];
  expect(removeOrthogonalTab(shifted, 7, options)).toHaveLength(4);
});
it('never removes an inward notch as an outward tab', () => {
  expect(() =>
    removeOrthogonalTab(addOrthogonalNotch(square, 0, 20, 20, 14, options), 1, options),
  ).toThrow('REQUIRE_OUTWARD');
});
it.each([
  [-1, 20, 20, 14],
  [0.5, 20, 20, 14],
  [4, 20, 20, 14],
  [0, 0, 20, 14],
  [0, 20, -1, 14],
  [0, 20, 20, NaN],
  [0, 90, 20, 14],
  [0, 20, 20, 60],
  [0, 20, 6, 14],
  [0, 20, 20, 6],
])('rejects invalid bounds or insufficient clearance %#', (edge, start, width, depth) => {
  expect(() => addOrthogonalTab(square, edge!, start!, width!, depth!, options)).toThrow();
});
it('rejects a tab crossing the opposite arm of a U', () => {
  const u: CutterPoint[] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [70, 100],
    [70, 30],
    [30, 30],
    [30, 100],
    [0, 100],
  ];
  expect(() => addOrthogonalTab(u, 4, 10, 20, 45, options)).toThrow();
});
it.each([-1, 0, 2, 3, 4, 8, 1.5])('refuses arbitrary removal at %j', (first) => {
  expect(() =>
    removeOrthogonalTab(addOrthogonalTab(square, 0, 20, 20, 14, options), first, options),
  ).toThrow();
});
it('revalidates removal against the actual current wall and rejects duplicate closing vertices', () => {
  const tab = addOrthogonalTab(square, 0, 20, 20, 14, options);
  expect(() => removeOrthogonalTab(tab, 1, { ...options, wallMm: NaN })).toThrow();
  expect(() => addOrthogonalTab([...square, square[0]!], 0, 20, 20, 14, options)).toThrow(
    'CLOSED_DUPLICATE',
  );
});
