import { expect, it } from 'vitest';
import { orthogonalDragBox, orthogonalDragPoint, orthogonalDragHit } from './orthogonal-drag';
const points = [
  [0, 0],
  [80, 0],
  [80, 30],
  [30, 30],
  [30, 80],
  [0, 80],
] as const;
it('fits the physical contour with a fixed mm margin and maps/snaps pointer coordinates', () => {
  const box = orthogonalDragBox(points);
  expect(box).toEqual({ x: -20, y: -20, width: 120, height: 120 });
  expect(orthogonalDragPoint(100, 100, 240, 240, box)).toEqual([30, 30]);
  expect(orthogonalDragPoint(100.9, 100, 240, 240, box)).toEqual([30, 30]);
  expect(orthogonalDragPoint(101.1, 100, 240, 240, box)).toEqual([31, 30]);
});
it('maps non-square viewports and fractional/translated contours without changing their shape', () => {
  const shifted = points.map(([x, y]) => [x + 10.25, y - 20.5] as const);
  const box = orthogonalDragBox(shifted);
  expect(box.width).toBe(120);
  expect(orthogonalDragPoint(120, 60, 240, 120, box)).toEqual([50, 20]);
});
it('clamps coordinates at kernel limits and rejects unusable viewports', () => {
  const box = orthogonalDragBox(points);
  expect(orthogonalDragPoint(-99999, 99999, 240, 240, box)).toEqual([-1000, 1000]);
  for (const [width, height] of [
    [0, 100],
    [100, 0],
    [NaN, 100],
    [100, Infinity],
  ])
    expect(() => orthogonalDragPoint(0, 0, width!, height!, box)).toThrow();
  expect(() => orthogonalDragBox([])).toThrow();
});
it('uses a 12 CSS pixel nearest-vertex hit radius with stable ties and no snapping', () => {
  const box = orthogonalDragBox(points);
  expect(orthogonalDragHit(points, 40, 40, 240, 240, box)).toBe(0);
  expect(orthogonalDragHit(points, 52, 40, 240, 240, box)).toBe(0);
  expect(orthogonalDragHit(points, 52.1, 40, 240, 240, box)).toBeNull();
  expect(
    orthogonalDragHit(
      [
        [0, 0],
        [10, 0],
      ],
      50,
      40,
      240,
      240,
      box,
    ),
  ).toBe(0);
  expect(orthogonalDragHit([], 0, 0, 240, 240, box)).toBeNull();
});
