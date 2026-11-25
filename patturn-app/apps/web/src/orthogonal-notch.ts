import {
  orthogonalCutterProfile,
  type CutterPoint,
  type ConvexCutterOptions,
} from '@patturn/kernel';
function source(points: readonly CutterPoint[]) {
  orthogonalCutterProfile(points, { heightMm: 20, wallMm: 0.8, tipMm: 0.4 });
  if (points[0]![0] === points.at(-1)![0] && points[0]![1] === points.at(-1)![1])
    throw Error('ORTHOGONAL_NOTCH_CLOSED_DUPLICATE');
}
/** Insert four corners on the explicitly chosen side of a directed edge. */
function addRectangle(
  points: readonly CutterPoint[],
  edge: number,
  start: number,
  width: number,
  depth: number,
  options: ConvexCutterOptions,
  direction: 1 | -1,
): CutterPoint[] {
  source(points);
  if (
    !Number.isInteger(edge) ||
    edge < 0 ||
    edge >= points.length ||
    points.length + 4 > 64 ||
    ![start, width, depth].every((n) => Number.isFinite(n) && n > 0)
  )
    throw Error('ORTHOGONAL_NOTCH_INVALID');
  const a = points[edge]!,
    b = points[(edge + 1) % points.length]!,
    length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (start + width >= length) throw Error('ORTHOGONAL_NOTCH_OUTSIDE_EDGE');
  const dx = (b[0] - a[0]) / length,
    dy = (b[1] - a[1]) / length;
  const area = points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0);
  const nx = -dy * Math.sign(area) * direction,
    ny = dx * Math.sign(area) * direction;
  const p: CutterPoint = [a[0] + dx * start, a[1] + dy * start],
    q: CutterPoint = [a[0] + dx * (start + width), a[1] + dy * (start + width)];
  const inserted: CutterPoint[] = [
    p,
    [p[0] + nx * depth, p[1] + ny * depth],
    [q[0] + nx * depth, q[1] + ny * depth],
    q,
  ];
  const result = points.flatMap((point, i) =>
    i === edge
      ? [[point[0], point[1]] as CutterPoint, ...inserted]
      : [[point[0], point[1]] as CutterPoint],
  );
  orthogonalCutterProfile(result, options);
  return result;
}
/** Remove exactly four rectangular corners on the requested side, from the first boundary corner. */
function removeRectangle(
  points: readonly CutterPoint[],
  first: number,
  options: ConvexCutterOptions,
  direction: 1 | -1,
): CutterPoint[] {
  source(points);
  if (!Number.isInteger(first) || first < 0 || first >= points.length || points.length < 8)
    throw Error('ORTHOGONAL_NOTCH_INVALID');
  const at = (i: number) => points[(i + points.length) % points.length]!;
  const a = at(first - 1),
    p = at(first),
    r = at(first + 1),
    s = at(first + 2),
    q = at(first + 3),
    b = at(first + 4);
  const horizontal = a[1] === b[1],
    vertical = a[0] === b[0];
  if (horizontal === vertical) throw Error('ORTHOGONAL_NOTCH_REQUIRE_RECTANGLE');
  if (
    horizontal
      ? p[1] !== a[1] || q[1] !== a[1] || r[0] !== p[0] || s[0] !== q[0] || r[1] !== s[1]
      : p[0] !== a[0] || q[0] !== a[0] || r[1] !== p[1] || s[1] !== q[1] || r[0] !== s[0]
  )
    throw Error('ORTHOGONAL_NOTCH_REQUIRE_RECTANGLE');
  const area = points.reduce((sum, c, i) => {
    const d = at(i + 1);
    return sum + c[0] * d[1] - d[0] * c[1];
  }, 0);
  const cross = (b[0] - a[0]) * (r[1] - p[1]) - (b[1] - a[1]) * (r[0] - p[0]);
  if (cross * Math.sign(area) * direction <= 0)
    throw Error(
      direction === 1 ? 'ORTHOGONAL_NOTCH_REQUIRE_INWARD' : 'ORTHOGONAL_TAB_REQUIRE_OUTWARD',
    );
  const lengthSquared = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  const projection = (c: CutterPoint) =>
    ((c[0] - a[0]) * (b[0] - a[0]) + (c[1] - a[1]) * (b[1] - a[1])) / lengthSquared;
  if (!(projection(p) > 0 && projection(q) > projection(p) && projection(q) < 1))
    throw Error('ORTHOGONAL_NOTCH_REQUIRE_ORDERED');
  const removed = new Set([0, 1, 2, 3].map((offset) => (first + offset) % points.length));
  const result = points.filter((_, i) => !removed.has(i)).map(([x, y]) => [x, y] as CutterPoint);
  orthogonalCutterProfile(result, options);
  return result;
}

/** Existing inward-only contract remains unchanged. */
export function addOrthogonalNotch(
  points: readonly CutterPoint[],
  edge: number,
  start: number,
  width: number,
  depth: number,
  options: ConvexCutterOptions,
): CutterPoint[] {
  return addRectangle(points, edge, start, width, depth, options, 1);
}
export function removeOrthogonalNotch(
  points: readonly CutterPoint[],
  first: number,
  options: ConvexCutterOptions,
): CutterPoint[] {
  return removeRectangle(points, first, options, 1);
}
/** Explicit outward-only operation; final bounds, clearance and topology are revalidated. */
export function addOrthogonalTab(
  points: readonly CutterPoint[],
  edge: number,
  start: number,
  width: number,
  depth: number,
  options: ConvexCutterOptions,
): CutterPoint[] {
  return addRectangle(points, edge, start, width, depth, options, -1);
}
export function removeOrthogonalTab(
  points: readonly CutterPoint[],
  first: number,
  options: ConvexCutterOptions,
): CutterPoint[] {
  return removeRectangle(points, first, options, -1);
}
