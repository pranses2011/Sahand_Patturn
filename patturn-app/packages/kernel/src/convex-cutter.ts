import type { Mesh } from './revolve.js';
import { circularCutterProfile, type CircularCutterOptions } from './cookie-cutter.js';
export type CutterPoint = readonly [number, number];
export type ConvexCutterOptions = Omit<CircularCutterOptions, 'diameterMm' | 'segments'>;
/** One strictly convex linear contour, physical mm. No holes, collinear edges or acute miters. */
export function convexCutterProfile(input: readonly CutterPoint[], options: ConvexCutterOptions) {
  if (!Array.isArray(input) || input.length < 3 || input.length > 65)
    throw Error('CUTTER_INVALID_CONTOUR');
  let points: [number, number][] = input.map((p) => {
    if (
      !Array.isArray(p) ||
      p.length !== 2 ||
      p.some((n) => !Number.isFinite(n) || Math.abs(n) > 1000)
    )
      throw Error('CUTTER_INVALID_CONTOUR');
    return [p[0], p[1]];
  });
  if (points[0]![0] === points.at(-1)![0] && points[0]![1] === points.at(-1)![1]) points.pop();
  if (points.length < 3 || points.length > 64) throw Error('CUTTER_INVALID_CONTOUR');
  const minX = Math.min(...points.map((p) => p[0])),
    maxX = Math.max(...points.map((p) => p[0]));
  const minZ = Math.min(...points.map((p) => p[1])),
    maxZ = Math.max(...points.map((p) => p[1]));
  const width = maxX - minX,
    depth = maxZ - minZ;
  if (width < 20 || width > 150 || depth < 20 || depth > 150) throw Error('CUTTER_CONTOUR_BOUNDS');
  const area = points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0);
  if (area < 0) points.reverse();
  // Every other vertex must be strictly left of every directed edge: rejects stars too.
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length]!,
      dx = b[0] - a[0],
      dz = b[1] - a[1];
    if (Math.hypot(dx, dz) < 1e-4) throw Error('CUTTER_INVALID_CONTOUR');
    points.forEach((p, j) => {
      if (j === i || j === (i + 1) % points.length) return;
      if (dx * (p[1] - a[1]) - dz * (p[0] - a[0]) <= 1e-7)
        throw Error('CUTTER_NOT_STRICTLY_CONVEX');
    });
  });
  points = points.map((p) => [p[0] - (minX + maxX) / 2, p[1] - (minZ + maxZ) / 2]);
  const normals = points.map((p, i) => {
    const q = points[(i + 1) % points.length]!,
      dx = q[0] - p[0],
      dz = q[1] - p[1],
      length = Math.hypot(dx, dz);
    return [dz / length, -dx / length] as const;
  });
  const offsets = points.map((_, i) => {
    const a = normals[(i + points.length - 1) % points.length]!,
      b = normals[i]!;
    const denominator = 1 + a[0] * b[0] + a[1] * b[1];
    if (denominator <= 1e-8) throw Error('CUTTER_MITER_TOO_SHARP');
    const delta = [(a[0] + b[0]) / denominator, (a[1] + b[1]) / denominator] as const;
    if (Math.hypot(...delta) > 4) throw Error('CUTTER_MITER_TOO_SHARP');
    return delta;
  });
  const diameterMm = Math.max(width, depth),
    radius = diameterMm / 2;
  const { rings } = circularCutterProfile({ ...options, diameterMm });
  const loops = rings.map((ring) => ({
    height: ring.y,
    points: points.map(
      (p, i) =>
        [
          p[0] + offsets[i]![0] * (ring.r - radius),
          p[1] + offsets[i]![1] * (ring.r - radius),
        ] as CutterPoint,
    ),
  }));
  return { loops, points, width, depth };
}
export function buildConvexCutter(
  input: readonly CutterPoint[],
  options: ConvexCutterOptions,
): Mesh {
  const { loops } = convexCutterProfile(input, options),
    count = loops[0]!.points.length;
  const positions = new Float32Array(loops.length * count * 3),
    indices = new Uint32Array(loops.length * count * 6);
  loops.forEach((loop, ring) =>
    loop.points.forEach((p, s) => {
      positions.set([p[0], loop.height, p[1]], (ring * count + s) * 3);
      const a = ring * count + s,
        b = ring * count + ((s + 1) % count),
        c = ((ring + 1) % loops.length) * count + ((s + 1) % count),
        d = ((ring + 1) % loops.length) * count + s;
      indices.set([a, c, b, a, d, c], (ring * count + s) * 6);
    }),
  );
  return { positions, indices };
}
