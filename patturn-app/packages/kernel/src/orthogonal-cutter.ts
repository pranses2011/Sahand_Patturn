import type { Mesh } from './revolve.js';
import type { CutterPoint, ConvexCutterOptions } from './convex-cutter.js';
import { circularCutterProfile } from './cookie-cutter.js';

type Edge = { a: CutterPoint; b: CutterPoint; nx: number; nz: number };
/** Lower bound is exact for axis-aligned segments (distance between their bounding boxes). */
function edgeDistance(a: Edge, b: Edge): number {
  const gap = (axis: 0 | 1) =>
    Math.max(
      0,
      Math.min(a.a[axis], a.b[axis]) - Math.max(b.a[axis], b.b[axis]),
      Math.min(b.a[axis], b.b[axis]) - Math.max(a.a[axis], a.b[axis]),
    );
  return Math.hypot(gap(0), gap(1));
}

/**
 * Experimental one-contour axis-aligned polygon, including L/U shapes. No holes.
 * A conservative clearance gate excludes topology changes at every intermediate offset:
 * each endpoint moves at most sqrt(2)*maxOffset, so two non-neighboring edges cannot meet
 * when their original distance exceeds twice that bound. This deliberately rejects some
 * valid thin features instead of merging notches, clipping or silently changing topology.
 */
export function orthogonalCutterProfile(
  input: readonly CutterPoint[],
  options: ConvexCutterOptions,
) {
  if (!Array.isArray(input) || input.length < 4 || input.length > 65)
    throw Error('ORTHOGONAL_CUTTER_INVALID_CONTOUR');
  let points: CutterPoint[] = input.map((p) => {
    if (
      !Array.isArray(p) ||
      p.length !== 2 ||
      p.some((n) => !Number.isFinite(n) || Math.abs(n) > 1000)
    )
      throw Error('ORTHOGONAL_CUTTER_INVALID_CONTOUR');
    return [p[0], p[1]];
  });
  if (points[0]![0] === points.at(-1)![0] && points[0]![1] === points.at(-1)![1]) points.pop();
  if (points.length < 4 || points.length > 64) throw Error('ORTHOGONAL_CUTTER_INVALID_CONTOUR');
  const xs = points.map((p) => p[0]),
    zs = points.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minZ = Math.min(...zs),
    maxZ = Math.max(...zs);
  const width = maxX - minX,
    depth = maxZ - minZ;
  if (width < 20 || width > 150 || depth < 20 || depth > 150)
    throw Error('ORTHOGONAL_CUTTER_BOUNDS');
  const area = points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0);
  if (Math.abs(area) < 1e-7) throw Error('ORTHOGONAL_CUTTER_INVALID_CONTOUR');
  if (area < 0) points.reverse();
  points = points.map((p) => [p[0] - (minX + maxX) / 2, p[1] - (minZ + maxZ) / 2]);
  const diameterMm = Math.max(width, depth),
    radius = diameterMm / 2;
  const { rings } = circularCutterProfile({ ...options, diameterMm });
  const maxOffset = Math.max(...rings.map((r) => r.r - radius));
  const edges: Edge[] = points.map((a, i) => {
    const b = points[(i + 1) % points.length]!,
      dx = b[0] - a[0],
      dz = b[1] - a[1];
    if ((dx === 0) === (dz === 0)) throw Error('ORTHOGONAL_CUTTER_REQUIRE_AXIS_ALIGNED');
    const length = Math.hypot(dx, dz);
    if (length <= 2 * maxOffset + 1e-6) throw Error('ORTHOGONAL_CUTTER_CLEARANCE');
    return { a, b, nx: dz / length, nz: -dx / length };
  });
  edges.forEach((edge, i) => {
    const next = edges[(i + 1) % edges.length]!;
    if (edge.nx * next.nx + edge.nz * next.nz !== 0)
      throw Error('ORTHOGONAL_CUTTER_REQUIRE_RIGHT_ANGLES');
    edges.forEach((other, j) => {
      if (j <= i || j === i + 1 || (i === 0 && j === edges.length - 1)) return;
      if (edgeDistance(edge, other) <= 2 * Math.SQRT2 * maxOffset + 1e-6)
        throw Error('ORTHOGONAL_CUTTER_CLEARANCE');
    });
  });
  const loops = rings.map((ring) => ({
    height: ring.y,
    points: points.map((p, i) => {
      const previous = edges[(i + edges.length - 1) % edges.length]!,
        edge = edges[i]!,
        offset = ring.r - radius;
      return [
        p[0] + (previous.nx + edge.nx) * offset,
        p[1] + (previous.nz + edge.nz) * offset,
      ] as CutterPoint;
    }),
  }));
  return { loops, points, width, depth, maxOffset };
}

/** Closed periodic wall profile, no cap across the polygon's opening. All lengths in mm. */
export function buildOrthogonalCutter(
  input: readonly CutterPoint[],
  options: ConvexCutterOptions,
): Mesh {
  const { loops } = orthogonalCutterProfile(input, options),
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
