import { expect, it } from 'vitest';
import {
  seedOrthogonalSketch as seed,
  closeOrthogonalSketch as close,
  appendOrthogonalSketchPoint as add,
} from './orthogonal-sketch';
import { buildOrthogonalCutter, validateMesh, type CutterPoint } from '@patturn/kernel';
const options = { heightMm: 20, wallMm: 1.6, tipMm: 0.6 };
const l: CutterPoint[] = [
  [-10.25, 20.125],
  [69.75, 20.125],
  [69.75, 50.375],
  [20.5, 50.375],
  [20.5, 100.125],
  [-10.25, 100.125],
];
it('translates negative/offset coordinates without rescaling, rounding, reordering or mutation', () => {
  const before = JSON.stringify(l),
    result = seed(l, options);
  expect(result).toEqual([
    [0, 0],
    [80, 0],
    [80, 30.25],
    [30.75, 30.25],
    [30.75, 80],
    [0, 80],
  ]);
  expect(JSON.stringify(l)).toBe(before);
  expect(result[0]).not.toBe(l[0]);
  expect(seed(l, options)).toEqual(result);
  expect(seed(result, options)).toEqual(result);
});
it('preserves the winding and starting corner of the input', () => {
  const result = seed([...l].reverse(), options);
  expect(result).toEqual(seed(l, options).reverse());
});
it('can delete and redraw a tail and close with exact current settings', () => {
  let points = seed(l, options).slice(0, 4);
  points = add(points, 30.75, 100);
  points = add(points, 0, 100);
  const result = close(points, options);
  expect(result).toHaveLength(6);
  expect(validateMesh(buildOrthogonalCutter(result, options)).ok).toBe(true);
  expect(seed(l, options)[4]).toEqual([30.75, 80]);
});
it('revalidates actual wall and rejects repeated closing points and unsupported shapes', () => {
  expect(() => seed(l, { ...options, wallMm: 10 })).toThrow();
  expect(() => seed([...l, l[0]!], options)).toThrow('CLOSED_DUPLICATE');
  expect(() =>
    seed(
      [
        [0, 0],
        [80, 0],
        [40, 80],
      ],
      options,
    ),
  ).toThrow();
});
it('preserves a 150mm workspace bound and rejects larger or nonfinite contours', () => {
  const box: CutterPoint[] = [
    [500, 500],
    [650, 500],
    [650, 650],
    [500, 650],
  ];
  expect(seed(box, options)).toEqual([
    [0, 0],
    [150, 0],
    [150, 150],
    [0, 150],
  ]);
  expect(() =>
    seed(
      [
        [0, 0],
        [151, 0],
        [151, 80],
        [0, 80],
      ],
      options,
    ),
  ).toThrow();
  expect(() =>
    seed(
      [
        [NaN, 0],
        [80, 0],
        [80, 80],
        [0, 80],
      ],
      options,
    ),
  ).toThrow();
});
