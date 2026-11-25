import { expect, it } from 'vitest';
import {
  buildOrthogonalCutter,
  orthogonalCutterProfile,
  validateMesh,
  type CutterPoint,
} from '@patturn/kernel';
import { transformOrthogonalContour, type OrthogonalTransform } from './orthogonal-transform';
const points: CutterPoint[] = [
  [10.125, 20.25],
  [90.125, 20.25],
  [90.125, 50.25],
  [40.125, 50.25],
  [40.125, 80.25],
  [10.125, 80.25],
];
const options = { heightMm: 20, wallMm: 1.6, tipMm: 0.6 };
const operations: OrthogonalTransform[] = ['clockwise', 'counterclockwise', 'mirrorX', 'mirrorY'];
it.each(operations)(
  'preserves lengths, area magnitude, validity and inputs for %s in either winding',
  (operation) => {
    for (const input of [points, [...points].reverse()]) {
      const before = JSON.stringify(input),
        result = transformOrthogonalContour(input, operation, options);
      expect(JSON.stringify(input)).toBe(before);
      expect(result).not.toBe(input);
      expect(result).toHaveLength(input.length);
      const twiceArea = (contour: readonly CutterPoint[]) =>
        contour.reduce((sum, p, i) => {
          const q = contour[(i + 1) % contour.length]!;
          return sum + p[0] * q[1] - q[0] * p[1];
        }, 0);
      expect(twiceArea(result)).toBe(twiceArea(input) * (operation.startsWith('mirror') ? -1 : 1));
      for (let i = 0; i < input.length; i++) {
        const j = (i + 1) % input.length;
        expect(Math.hypot(result[i]![0] - result[j]![0], result[i]![1] - result[j]![1])).toBe(
          Math.hypot(input[i]![0] - input[j]![0], input[i]![1] - input[j]![1]),
        );
      }
      expect(validateMesh(buildOrthogonalCutter(result, options)).ok).toBe(true);
      expect(transformOrthogonalContour(input, operation, options)).toEqual(result);
      const profile = orthogonalCutterProfile(result, options);
      expect([profile.width, profile.depth]).toEqual(
        operation.startsWith('mirror') ? [80, 60] : [60, 80],
      );
    }
  },
);
it('uses SVG rotation direction and explicit coordinate-axis reflection', () => {
  expect(transformOrthogonalContour(points, 'clockwise', options)[0]).toEqual([-20.25, 10.125]);
  expect(transformOrthogonalContour(points, 'counterclockwise', options)[0]).toEqual([
    20.25, -10.125,
  ]);
  expect(transformOrthogonalContour(points, 'mirrorX', options)[0]).toEqual([-10.125, 20.25]);
  expect(transformOrthogonalContour(points, 'mirrorY', options)[0]).toEqual([10.125, -20.25]);
});
it('returns exactly to the original fractional coordinates with inverse operations', () => {
  let rotated = points;
  for (let i = 0; i < 4; i++) rotated = transformOrthogonalContour(rotated, 'clockwise', options);
  expect(rotated).toEqual(points);
  expect(
    transformOrthogonalContour(
      transformOrthogonalContour(points, 'clockwise', options),
      'counterclockwise',
      options,
    ),
  ).toEqual(points);
  for (const op of ['mirrorX', 'mirrorY'] as const)
    expect(
      transformOrthogonalContour(transformOrthogonalContour(points, op, options), op, options),
    ).toEqual(points);
});
it('normalizes signed zero without quantizing coordinates', () => {
  const shifted = points.map(([x, y]): CutterPoint => [x - 10.125, y - 20.25]);
  for (const op of operations)
    for (const p of transformOrthogonalContour(shifted, op, options))
      for (const value of p) expect(Object.is(value, -0)).toBe(false);
});
it.each(operations)('rechecks current wall/height options for %s', (operation) => {
  expect(() => transformOrthogonalContour(points, operation, { ...options, wallMm: 10 })).toThrow();
  expect(() =>
    transformOrthogonalContour(points, operation, { ...options, heightMm: NaN }),
  ).toThrow();
});
it('rejects unsupported, duplicate-closed and unknown operations rather than repairing', () => {
  expect(() => transformOrthogonalContour([...points, points[0]!], 'mirrorX', options)).toThrow(
    'CLOSED_DUPLICATE',
  );
  expect(() =>
    transformOrthogonalContour(
      [
        [0, 0],
        [80, 0],
        [40, 80],
      ],
      'mirrorX',
      options,
    ),
  ).toThrow();
  expect(() => transformOrthogonalContour(points, 'wrong' as OrthogonalTransform, options)).toThrow(
    'INVALID',
  );
});
