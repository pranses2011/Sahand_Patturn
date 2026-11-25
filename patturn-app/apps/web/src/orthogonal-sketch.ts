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

/** SVG xMidYMid meet mapping with a 5mm margin; never clamp an outside click onto a boundary. */
export function orthogonalSketchPointer(
  x: number,
  y: number,
  width: number,
  height: number,
): CutterPoint {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0)
    throw Error('ORTHOGONAL_SKETCH_VIEWPORT');
  const size = Math.min(width, height),
    px = ((x - (width - size) / 2) * 160) / size - 5,
    py = ((y - (height - size) / 2) * 160) / size - 5;
  if (px < 0 || py < 0 || px > 150 || py > 150) throw Error('ORTHOGONAL_SKETCH_OUTSIDE');
  return [Math.round(px) || 0, Math.round(py) || 0];
}

/** Copy an existing open contour into the workspace by translation only, preserving order and decimals. */
export function seedOrthogonalSketch(
  points: readonly CutterPoint[],
  options: ConvexCutterOptions,
): CutterPoint[] {
  orthogonalCutterProfile(points, options);
  if (points[0]![0] === points.at(-1)![0] && points[0]![1] === points.at(-1)![1])
    throw Error('ORTHOGONAL_SKETCH_CLOSED_DUPLICATE');
  const minX = Math.min(...points.map((p) => p[0])),
    minY = Math.min(...points.map((p) => p[1]));
  return closeOrthogonalSketch(
    points.map(([x, y]): CutterPoint => [x - minX, y - minY]),
    options,
  );
}
