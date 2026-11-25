import {
  orthogonalCutterProfile,
  type CutterPoint,
  type ConvexCutterOptions,
} from '@patturn/kernel';
/** Move one corner and slide each neighboring endpoint on the adjoining edge's shared axis. */
export function moveOrthogonalVertex(
  points: readonly CutterPoint[],
  index: number,
  x: number,
  y: number,
  options: ConvexCutterOptions,
): CutterPoint[] {
  orthogonalCutterProfile(points, { heightMm: 20, wallMm: 0.8, tipMm: 0.4 });
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= points.length ||
    ![x, y].every(Number.isFinite)
  )
    throw Error('ORTHOGONAL_VERTEX_INVALID');
  const result: [number, number][] = points.map((p) => [p[0], p[1]]);
  // The panel uses unclosed contours. Explicitly reject a repeated endpoint to avoid editing a duplicate.
  if (points[0]![0] === points.at(-1)![0] && points[0]![1] === points.at(-1)![1])
    throw Error('ORTHOGONAL_VERTEX_CLOSED_DUPLICATE');
  const previous = (index + points.length - 1) % points.length,
    next = (index + 1) % points.length,
    current = points[index]!;
  result[index] = [x, y];
  if (points[previous]![0] === current[0]) result[previous]![0] = x;
  else result[previous]![1] = y;
  if (points[next]![0] === current[0]) result[next]![0] = x;
  else result[next]![1] = y;
  orthogonalCutterProfile(result, options);
  return result;
}
/** Strip the optional closing point only; do not center, rescale, simplify or change winding. */
export function openOrthogonalContour(points: readonly CutterPoint[]): CutterPoint[] {
  const result = points.map((p) => [p[0], p[1]] as CutterPoint);
  if (
    result.length > 1 &&
    result[0]![0] === result.at(-1)![0] &&
    result[0]![1] === result.at(-1)![1]
  )
    result.pop();
  return result;
}
