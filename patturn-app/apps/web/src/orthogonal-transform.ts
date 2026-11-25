import {
  orthogonalCutterProfile,
  type ConvexCutterOptions,
  type CutterPoint,
} from '@patturn/kernel';
export type OrthogonalTransform = 'clockwise' | 'counterclockwise' | 'mirrorX' | 'mirrorY';
/** Exact axis permutation/sign changes about the coordinate origin: no trig, rounding or repair. */
export function transformOrthogonalContour(
  points: readonly CutterPoint[],
  operation: OrthogonalTransform,
  options: ConvexCutterOptions,
): CutterPoint[] {
  orthogonalCutterProfile(points, { heightMm: 20, wallMm: 0.8, tipMm: 0.4 });
  if (points[0]![0] === points.at(-1)![0] && points[0]![1] === points.at(-1)![1])
    throw Error('ORTHOGONAL_TRANSFORM_CLOSED_DUPLICATE');
  const result = points
    .map(([x, y]): CutterPoint => {
      switch (operation) {
        // SVG coordinate system: positive y points downwards.
        case 'clockwise':
          return [-y, x];
        case 'counterclockwise':
          return [y, -x];
        case 'mirrorX':
          return [-x, y];
        case 'mirrorY':
          return [x, -y];
        default:
          throw Error('ORTHOGONAL_TRANSFORM_INVALID');
      }
    })
    .map(([x, y]): CutterPoint => [x === 0 ? 0 : x, y === 0 ? 0 : y]);
  orthogonalCutterProfile(result, options);
  return result;
}
