import { expect, it } from 'vitest';
import { buildOrthogonalCutter, validateMesh, type CutterPoint } from '@patturn/kernel';
import {
  appendOrthogonalSketchPoint as add,
  closeOrthogonalSketch as close,
} from './orthogonal-sketch';
const options = { heightMm: 20, wallMm: 1.6, tipMm: 0.6 };
const l: CutterPoint[] = [
  [10.125, 20.25],
  [90.125, 20.25],
  [90.125, 50.25],
  [40.125, 50.25],
  [40.125, 80.25],
  [10.125, 80.25],
];
it('builds an open fractional L without mutating or aliasing previous drafts', () => {
  let draft: CutterPoint[] = [];
  for (const [x, y] of l) {
    const before = JSON.stringify(draft),
      next = add(draft, x, y);
    expect(JSON.stringify(draft)).toBe(before);
    expect(next).not.toBe(draft);
    if (draft.length) expect(next[0]).not.toBe(draft[0]);
    draft = next;
  }
  expect(draft).toEqual(l);
  expect(close(draft, options)).toEqual(l);
  expect(validateMesh(buildOrthogonalCutter(close(draft, options), options)).ok).toBe(true);
});
it('accepts both windings and returns an independent deterministic contour', () => {
  for (const points of [l, [...l].reverse()]) {
    const result = close(points, options);
    expect(result).toEqual(points);
    expect(result[0]).not.toBe(points[0]);
    expect(close(points, options)).toEqual(result);
  }
});
it.each([
  [NaN, 0],
  [0, Infinity],
  [-1, 0],
  [151, 0],
  [0, -1],
  [0, 151],
])('rejects invalid coordinates %j,%j', (x, y) => {
  expect(() => add([], x, y)).toThrow('POINT');
});
it('normalizes negative zero without snapping fractional points', () => {
  expect(add([], -0, 0)).toEqual([[0, 0]]);
  expect(add([[0, 0]], 0, 20.125)).toEqual([
    [0, 0],
    [0, 20.125],
  ]);
});
it('rejects diagonals, repeated points, implicit closing and collinear or reversing steps', () => {
  expect(() => add([[0, 0]], 20, 20)).toThrow('AXIS');
  expect(() => add([[0, 0]], 0, 0)).toThrow('DUPLICATE');
  expect(() =>
    add(
      [
        [0, 0],
        [80, 0],
      ],
      40,
      0,
    ),
  ).toThrow('TURN');
  expect(() =>
    add(
      [
        [0, 0],
        [80, 0],
      ],
      100,
      0,
    ),
  ).toThrow('TURN');
  expect(() => add(l, ...l[0]!)).toThrow('DUPLICATE');
});
it('bounds drafts at 64 vertices', () => {
  expect(() =>
    add(
      Array.from({ length: 64 }, (_, i): CutterPoint => [i, 0]),
      70,
      0,
    ),
  ).toThrow('POINT');
});
it.each(
  [
    [],
    [
      [0, 0],
      [80, 0],
      [80, 60],
    ],
    [
      [0, 0],
      [80, 0],
      [80, 60],
      [20, 60],
    ],
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
  ].map((points) => ({ points: points.map(([x, y]): CutterPoint => [x!, y!]) })),
)('rejects incomplete, diagonal closing or undersized contours %#', ({ points }) => {
  expect(() => close(points, options)).toThrow();
});
it('rejects crossings and respects current wall clearance rather than a minimum-wall fallback', () => {
  const crossing: CutterPoint[] = [
    [0, 0],
    [100, 0],
    [100, 80],
    [30, 80],
    [30, 20],
    [80, 20],
    [80, 100],
    [0, 100],
  ];
  expect(() => close(crossing, options)).toThrow();
  expect(() => close(l, { ...options, wallMm: 10 })).toThrow();
  expect(() => close(l, { ...options, heightMm: NaN })).toThrow();
});
