import {
  orthogonalCutterProfile,
  type ConvexCutterOptions,
  type CutterPoint,
} from '@patturn/kernel';
/** An open numerical draft: no implicit closing, snapping, or inserted elbow. */
export function appendOrthogonalSketchPoint(
  points: readonly CutterPoint[],
  x: number,
  y: number,
): CutterPoint[] {
  if (points.length >= 64 || ![x, y].every((n) => Number.isFinite(n) && n >= 0 && n <= 150))
    throw Error('ORTHOGONAL_SKETCH_POINT');
  if (points.some((p) => p[0] === x && p[1] === y)) throw Error('ORTHOGONAL_SKETCH_DUPLICATE');
  const last = points.at(-1),
    previous = points.at(-2);
  if (last) {
    const horizontal = last[1] === y,
      vertical = last[0] === x;
    if (horizontal === vertical) throw Error('ORTHOGONAL_SKETCH_AXIS');
    if (previous && (horizontal ? previous[1] === last[1] : previous[0] === last[0]))
      throw Error('ORTHOGONAL_SKETCH_TURN');
  }
  return [...points.map(([px, py]): CutterPoint => [px, py]), [x === 0 ? 0 : x, y === 0 ? 0 : y]];
}
/** Final validation uses the exact current settings; a draft is never a fallback export. */
export function closeOrthogonalSketch(
  points: readonly CutterPoint[],
  options: ConvexCutterOptions,
): CutterPoint[] {
  let checked: CutterPoint[] = [];
  for (const [x, y] of points) checked = appendOrthogonalSketchPoint(checked, x, y);
  orthogonalCutterProfile(checked, options);
  return checked;
}
