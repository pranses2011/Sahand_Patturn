import { expect, it } from 'vitest';
import { addOrthogonalNotch, removeOrthogonalNotch } from './orthogonal-notch';
import { buildOrthogonalCutter, validateMesh, type CutterPoint } from '@patturn/kernel';
const square: CutterPoint[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];
const l: CutterPoint[] = [
  [0, 0],
  [80, 0],
  [80, 30],
  [30, 30],
  [30, 80],
  [0, 80],
];
const options = { heightMm: 20, wallMm: 1.6, tipMm: 0.6 };
it('adds and removes exactly four corners of an inward notch without mutating the contour', () => {
  const before = JSON.stringify(l);
  const result = addOrthogonalNotch(l, 0, 20, 20, 14, options);
  expect(result).toEqual([
    [0, 0],
    [20, 0],
    [20, 14],
    [40, 14],
    [40, 0],
    [80, 0],
    [80, 30],
    [30, 30],
    [30, 80],
    [0, 80],
  ]);
  expect(validateMesh(buildOrthogonalCutter(result, options)).ok).toBe(true);
  expect(removeOrthogonalNotch(result, 1, options)).toEqual(l);
  expect(JSON.stringify(l)).toBe(before);
});
it.each([0, 1, 2, 3])(
  'preserves orientation and makes a reversible notch on each square edge %j',
  (edge) => {
    for (const points of [square, [...square].reverse()]) {
      const result = addOrthogonalNotch(points, edge, 20, 20, 14, options);
      expect(result).toHaveLength(8);
      expect(validateMesh(buildOrthogonalCutter(result, options)).ok).toBe(true);
      expect(removeOrthogonalNotch(result, edge + 1, options)).toEqual(points);
    }
  },
);
it('supports a notch spanning the array seam and keeps fractional dimensions', () => {
  const result = addOrthogonalNotch(square, 3, 20.25, 20.5, 14.125, options);
  const shifted = [...result.slice(5), ...result.slice(0, 5)];
  // Original inserted first corner is index 4; after rotation by 5 it is the last vertex.
  const restored = removeOrthogonalNotch(shifted, 7, options);
  expect(restored).toHaveLength(4);
  expect(validateMesh(buildOrthogonalCutter(restored, options)).ok).toBe(true);
  expect(result[5]).toEqual([14.125, 79.75]);
});
it.each([
  { edge: -1, start: 20, width: 20, depth: 14 },
  { edge: 4, start: 20, width: 20, depth: 14 },
  { edge: 0.5, start: 20, width: 20, depth: 14 },
  { edge: 0, start: 0, width: 20, depth: 14 },
  { edge: 0, start: 20, width: -1, depth: 14 },
  { edge: 0, start: 20, width: 20, depth: NaN },
  { edge: 0, start: 90, width: 20, depth: 14 },
  { edge: 0, start: 20, width: 20, depth: 100 },
  { edge: 0, start: 20, width: 6, depth: 14 },
  { edge: 0, start: 20, width: 20, depth: 6 },
])('rejects invalid, crossing, collapsing or insufficient-clearance insertion %#', (p) => {
  const before = JSON.stringify(square);
  expect(() => addOrthogonalNotch(square, p.edge, p.start, p.width, p.depth, options)).toThrow();
  expect(JSON.stringify(square)).toBe(before);
});
it.each([-1, 0, 2, 3, 4, 8, 1.5])(
  'does not remove arbitrary corners when index %j is not the first notch corner',
  (first) => {
    const points = addOrthogonalNotch(square, 0, 20, 20, 14, options);
    expect(() => removeOrthogonalNotch(points, first, options)).toThrow();
  },
);
it('does not silently edit a repeated closing vertex or accept unsupported geometry', () => {
  expect(() => addOrthogonalNotch([...square, square[0]!], 0, 20, 20, 14, options)).toThrow(
    'CLOSED_DUPLICATE',
  );
  expect(() => removeOrthogonalNotch(l, 0, options)).toThrow();
});

it('refuses to treat an outward rectangular protrusion as an inward notch', () => {
  const bump: CutterPoint[] = [
    [0, 0],
    [20, 0],
    [20, -14],
    [40, -14],
    [40, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  expect(validateMesh(buildOrthogonalCutter(bump, options)).ok).toBe(true);
  expect(() => removeOrthogonalNotch(bump, 1, options)).toThrow('REQUIRE_INWARD');
});
