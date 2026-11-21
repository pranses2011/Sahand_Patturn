export interface DxfBounds { width: number; height: number }
type Point = [number, number];

/** Liang–Barsky clipping against [0,width] × [0,height]. */
export function clipLine(a: Point, b: Point, bounds: DxfBounds): [Point, Point] | null {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let lo = 0, hi = 1;
  const ps = [-dx, dx, -dy, dy], qs = [a[0], bounds.width - a[0], a[1], bounds.height - a[1]];
  for (let i = 0; i < 4; i++) {
    const p = ps[i]!, q = qs[i]!;
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) lo = Math.max(lo, t); else hi = Math.min(hi, t);
    if (lo >= hi) return null;
  }
  const point = (t: number): Point => [Math.max(0, Math.min(bounds.width, a[0] + t * dx)), Math.max(0, Math.min(bounds.height, a[1] + t * dy))];
  const start = point(lo), end = point(hi);
  return Math.hypot(end[0] - start[0], end[1] - start[1]) > 1e-9 ? [start, end] : null;
}

/** Exact angular intervals of a circle inside the rectangle, counterclockwise radians.
 * An empty list means no positive-length part; [0,2π] means a complete circle.
 */
export function clipCircle(c: { x: number; y: number; radius: number }, b: DxfBounds): [number, number][] {
  const tau = 2 * Math.PI;
  const angles = [0, tau];
  const add = (a: number) => angles.push((a % tau + tau) % tau);
  for (const x of [0, b.width]) {
    const v = (x - c.x) / c.radius;
    if (Math.abs(v) <= 1) { const a = Math.acos(v); add(a); add(-a); }
  }
  for (const y of [0, b.height]) {
    const v = (y - c.y) / c.radius;
    if (Math.abs(v) <= 1) { const a = Math.asin(v); add(a); add(Math.PI - a); }
  }
  const sorted = angles.sort((a, b) => a - b).filter((a, i, all) => !i || a - all[i - 1]! > 1e-12);
  const out: [number, number][] = [];
  for (let i = 1; i < sorted.length; i++) {
    const start = sorted[i - 1]!, end = sorted[i]!, mid = (start + end) / 2;
    const x = c.x + c.radius * Math.cos(mid), y = c.y + c.radius * Math.sin(mid);
    if (x >= 0 && x <= b.width && y >= 0 && y <= b.height) {
      const last = out.at(-1);
      if (last && Math.abs(last[1] - start) < 1e-12) last[1] = end;
      else out.push([start, end]);
    }
  }
  return out;
}
