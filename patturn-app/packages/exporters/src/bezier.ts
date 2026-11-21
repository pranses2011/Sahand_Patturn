export type Point2 = [number, number];

export function segmentDistance(p: Point2, a: Point2, b: Point2): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length2 = dx * dx + dy * dy;
  const t =
    length2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** De Casteljau subdivision. The convex hull of each accepted cubic is inside
 * a tolerance-radius capsule around its chord (control point to SEGMENT distance).
 * Bounds are geometric in model mm, not pixel sampling. Floating-point arithmetic applies.
 */
export function flattenCubic(
  a: Point2,
  b: Point2,
  c: Point2,
  d: Point2,
  tolerance: number,
): Point2[] {
  if (
    !Number.isFinite(tolerance) ||
    tolerance < 0.001 ||
    tolerance > 1 ||
    ![...a, ...b, ...c, ...d].every((n) => Number.isFinite(n) && Math.abs(n) <= 1e7)
  )
    throw Error('DXF_INVALID_BEZIER_OPTIONS_OR_COORDINATES');
  const result: Point2[] = [[...a]];
  const mid = (p: Point2, q: Point2): Point2 => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const visit = (p: Point2, q: Point2, r: Point2, s: Point2, depth: number) => {
    if (result.length > 16384) throw Error('DXF_BEZIER_COMPLEXITY_LIMIT');
    if (Math.max(segmentDistance(q, p, s), segmentDistance(r, p, s)) <= tolerance) {
      result.push([...s]);
      return;
    }
    if (depth >= 24) throw Error('DXF_BEZIER_TOLERANCE_NOT_REACHED');
    const pq = mid(p, q),
      qr = mid(q, r),
      rs = mid(r, s),
      left = mid(pq, qr),
      right = mid(qr, rs),
      center = mid(left, right);
    visit(p, pq, left, center, depth + 1);
    visit(center, right, rs, s, depth + 1);
  };
  visit(a, b, c, d, 0);
  return result;
}
