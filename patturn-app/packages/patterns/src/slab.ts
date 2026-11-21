import type { Path } from './index.js';
export interface SlabOptions {
  bottomRadius: number;
  topRadius: number;
  height: number;
  guides: number;
}
/** Exact neutral-surface development of a cylinder or a conical frustum.
 * No clay thickness, seam allowance, shrinkage or general freeform flattening.
 */
export function buildSlab({ bottomRadius: b, topRadius: t, height: h, guides }: SlabOptions) {
  if (
    ![b, t].every((n) => Number.isFinite(n) && n >= 10 && n <= 150) ||
    !Number.isFinite(h) ||
    h < 10 ||
    h > 300 ||
    !Number.isInteger(guides) ||
    guides < 2 ||
    guides > 24
  )
    throw Error('INVALID_SLAB');
  const f = (n: number) => String(Math.round(n * 1e6) / 1e6);
  const paths: Path[] = [];
  if (Math.abs(b - t) < 1e-9) {
    const width = 2 * Math.PI * b;
    paths.push({ d: `M0 0 L${f(width)} 0 L${f(width)} ${f(h)} L0 ${f(h)} Z` });
    for (let i = 1; i < guides; i++)
      paths.push({ d: `M${f((width * i) / guides)} 0 L${f((width * i) / guides)} ${f(h)}` });
    return { paths, width, height: h, slant: h, angle: 2 * Math.PI, distortion: 0 };
  }
  const slant = Math.hypot(h, b - t),
    outer = (slant * Math.max(b, t)) / Math.abs(b - t),
    inner = (slant * Math.min(b, t)) / Math.abs(b - t);
  const angle = (2 * Math.PI * Math.abs(b - t)) / slant;
  // Both sector boundaries sampled with an explicit <=0.02mm chord error.
  const count = Math.max(8, Math.ceil(angle / (4 * Math.asin(Math.sqrt(0.02 / (2 * outer))))));
  const point = (radius: number, a: number): [number, number] => [
    radius * Math.sin(a),
    (radius === outer ? 0 : slant) + 2 * radius * Math.sin(a / 2) ** 2,
  ];
  const outerPoints = Array.from({ length: count + 1 }, (_, i) =>
    point(outer, -angle / 2 + (angle * i) / count),
  );
  const innerPoints = Array.from({ length: count + 1 }, (_, i) =>
    point(inner, angle / 2 - (angle * i) / count),
  );
  const all = [...outerPoints, ...innerPoints];
  const guidePairs = Array.from({ length: guides - 1 }, (_, i) => {
    const a = -angle / 2 + (angle * (i + 1)) / guides;
    return [point(inner, a), point(outer, a)];
  });
  const points = [...all, ...guidePairs.flat()];
  const minX = Math.min(...points.map((p) => p[0])),
    minY = Math.min(...points.map((p) => p[1]));
  const coord = ([x, y]: [number, number]) => `${f(x - minX)} ${f(y - minY)}`;
  paths.push({ d: all.map((p, i) => `${i === 0 ? 'M' : 'L'}${coord(p)}`).join(' ') + ' Z' });
  for (let i = 1; i < guides; i++) {
    const a = -angle / 2 + (angle * i) / guides;
    paths.push({ d: `M${coord(point(inner, a))} L${coord(point(outer, a))}` });
  }
  // Include guide extrema as well as the boundary vertices in the drawing bounds.

  const width = Math.max(...points.map((p) => p[0])) - minX;
  const height = Math.max(...points.map((p) => p[1])) - minY;
  return { paths, width: width + 1e-5, height: height + 1e-5, slant, angle, distortion: 0 };
}
