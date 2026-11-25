import type { Mesh } from './revolve.js';
import { validateMesh } from './mesh-validate.js';

export type SweepPoint = readonly [number, number, number];
export interface PolylineSweepOptions {
  path: readonly SweepPoint[];
  tubeRadius: number;
  segments?: number;
}
export const POLYLINE_SWEEP_LIMITS = Object.freeze({
  points: 64,
  coordinateMm: 500,
  minRadiusMm: 2,
  maxRadiusMm: 20,
  maxTurnDeg: 60,
  minSegments: 24,
  maxSegments: 128,
  minEdgeRadii: 4,
});
type V = [number, number, number];
const sub = (a: SweepPoint, b: SweepPoint): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: SweepPoint, b: SweepPoint) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: SweepPoint, b: SweepPoint): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const scale = (a: SweepPoint, s: number): V => [a[0] * s, a[1] * s, a[2] * s];
const add = (a: SweepPoint, b: SweepPoint): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const unit = (a: SweepPoint): V => scale(a, 1 / Math.hypot(...a));
const clamp = (s: number) => Math.min(1, Math.max(0, s));
/** Squared distance of two finite, nonzero segments, including their endpoints. */
function separation(a: SweepPoint, b: SweepPoint, c: SweepPoint, d: SweepPoint) {
  const u = sub(b, a),
    v = sub(d, c),
    w = sub(a, c),
    uu = dot(u, u),
    uv = dot(u, v),
    vv = dot(v, v),
    uw = dot(u, w),
    vw = dot(v, w);
  const denominator = uu * vv - uv * uv;
  let s = denominator > 1e-12 * uu * vv ? clamp((uv * vw - vv * uw) / denominator) : 0;
  let t = (uv * s + vw) / vv;
  if (t < 0) {
    t = 0;
    s = clamp(-uw / uu);
  } else if (t > 1) {
    t = 1;
    s = clamp((uv - uw) / uu);
  }
  const delta = sub(add(a, scale(u, s)), add(c, scale(v, t)));
  return dot(delta, delta);
}

/** Experimental circular sweep with rotation-minimising frames along sampled 3D corners.
 * Open polyline only, with planar end caps. No spline fitting, repair, body union or print guarantee.
 * Conservative length/turn/centreline separation guards are NOT a spatial self-intersection proof.
 */
export function buildPolylineSweep({
  path,
  tubeRadius: r,
  segments = 48,
}: PolylineSweepOptions): Mesh {
  if (
    !Number.isFinite(r) ||
    r < POLYLINE_SWEEP_LIMITS.minRadiusMm ||
    r > POLYLINE_SWEEP_LIMITS.maxRadiusMm ||
    !Number.isInteger(segments) ||
    segments < POLYLINE_SWEEP_LIMITS.minSegments ||
    segments > POLYLINE_SWEEP_LIMITS.maxSegments
  )
    throw Error('POLYLINE_SWEEP_INVALID_OPTIONS');
  if (!Array.isArray(path) || path.length < 2 || path.length > POLYLINE_SWEEP_LIMITS.points)
    throw Error('POLYLINE_SWEEP_PATH_LIMIT');
  const points: V[] = Array.from(path, (p) => {
    if (
      !Array.isArray(p) ||
      p.length !== 3 ||
      ![0, 1, 2].every(
        (axis) =>
          Number.isFinite(p[axis]) && Math.abs(p[axis]) <= POLYLINE_SWEEP_LIMITS.coordinateMm,
      )
    )
      throw Error('POLYLINE_SWEEP_INVALID_POINT');
    return [p[0], p[1], p[2]];
  });
  const directions: V[] = [];
  for (let i = 1; i < points.length; i++) {
    const edge = sub(points[i]!, points[i - 1]!);
    if (Math.hypot(...edge) < POLYLINE_SWEEP_LIMITS.minEdgeRadii * r)
      throw Error('POLYLINE_SWEEP_SHORT_EDGE');
    directions.push(unit(edge));
  }
  for (let i = 1; i < directions.length; i++)
    if (
      dot(directions[i - 1]!, directions[i]!) <
      Math.cos((POLYLINE_SWEEP_LIMITS.maxTurnDeg * Math.PI) / 180) - 1e-12
    )
      throw Error('POLYLINE_SWEEP_SHARP_TURN');
  for (let i = 0; i < directions.length; i++)
    for (let j = i + 2; j < directions.length; j++) {
      if (separation(points[i]!, points[i + 1]!, points[j]!, points[j + 1]!) < (2 * r + 1e-6) ** 2)
        throw Error('POLYLINE_SWEEP_CLEARANCE');
    }
  const tangents = points.map((_, i) =>
    i === 0
      ? directions[0]!
      : i === points.length - 1
        ? directions.at(-1)!
        : unit(add(directions[i - 1]!, directions[i]!)),
  );
  const first = tangents[0]!;
  // Deterministic initial frame: choose the coordinate axis least aligned with the tangent.
  let axis = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(first[i]!) < Math.abs(first[axis]!)) axis = i;
  const seed: V = [0, 0, 0];
  seed[axis] = 1;
  let normal = unit(cross(first, seed));
  const positions: number[] = [],
    indices: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const tangent = tangents[i]!;
    if (i) {
      const previous = tangents[i - 1]!,
        v = cross(previous, tangent),
        c = dot(previous, tangent);
      // Rodrigues minimal rotation; antiparallel tangents are excluded by turn guards.
      normal = add(add(normal, cross(v, normal)), scale(cross(v, cross(v, normal)), 1 / (1 + c)));
      normal = unit(sub(normal, scale(tangent, dot(normal, tangent))));
    }
    const binormal = cross(normal, tangent),
      center = points[i]!;
    for (let s = 0; s < segments; s++) {
      const angle = (2 * Math.PI * s) / segments;
      positions.push(
        ...add(
          center,
          scale(add(scale(normal, Math.cos(angle)), scale(binormal, Math.sin(angle))), r),
        ),
      );
    }
    if (i)
      for (let s = 0; s < segments; s++) {
        const a = (i - 1) * segments + s,
          b = (i - 1) * segments + ((s + 1) % segments),
          c = b + segments,
          d = a + segments;
        indices.push(a, c, b, a, d, c);
      }
  }
  for (const [ring, reverse] of [
    [0, true],
    [points.length - 1, false],
  ] as const) {
    const center = positions.length / 3;
    positions.push(...points[ring]!);
    for (let s = 0; s < segments; s++) {
      const a = ring * segments + s,
        b = ring * segments + ((s + 1) % segments);
      indices.push(center, reverse ? a : b, reverse ? b : a);
    }
  }
  const mesh: Mesh = { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
  const report = validateMesh(mesh);
  if (!report.ok) throw Error('POLYLINE_SWEEP_INVALID_MESH');
  mesh.meta = { volumeMm3: report.signedVolumeMm3 };
  return mesh;
}
