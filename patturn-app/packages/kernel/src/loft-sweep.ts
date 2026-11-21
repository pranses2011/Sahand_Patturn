import type { Mesh } from './revolve.js';

function bounded(n: number, min: number, max: number) {
  return Number.isFinite(n) && n >= min && n <= max;
}
/** Consistently oriented rings and planar fan caps; no duplicated seam vertices. */
function cappedRings(rings: number[][], segments: number): Mesh {
  const points = rings.flat(),
    indices: number[] = [];
  for (let ring = 0; ring < rings.length - 1; ring++)
    for (let s = 0; s < segments; s++) {
      const a = ring * segments + s,
        b = ring * segments + ((s + 1) % segments),
        c = b + segments,
        d = a + segments;
      indices.push(a, c, b, a, d, c);
    }
  for (const [ring, reverse] of [
    [0, true],
    [rings.length - 1, false],
  ] as const) {
    const center = points.length / 3;
    const values = rings[ring]!;
    for (let axis = 0; axis < 3; axis++)
      points.push(values.filter((_, i) => i % 3 === axis).reduce((a, b) => a + b, 0) / segments);
    for (let s = 0; s < segments; s++) {
      const a = ring * segments + s,
        b = ring * segments + ((s + 1) % segments);
      indices.push(center, reverse ? a : b, reverse ? b : a);
    }
  }
  return { positions: new Float32Array(points), indices: new Uint32Array(indices) };
}
export interface EllipseLoftOptions {
  bottomX: number;
  bottomZ: number;
  topX: number;
  topZ: number;
  height: number;
  offsetX: number;
  segments?: number;
}
/** Linear loft of two corresponding ellipse profiles. Values are radii in mm. */
export function buildEllipseLoft({
  bottomX,
  bottomZ,
  topX,
  topZ,
  height,
  offsetX,
  segments = 96,
}: EllipseLoftOptions): Mesh {
  if (
    ![bottomX, bottomZ, topX, topZ].every((n) => bounded(n, 5, 100)) ||
    !bounded(height, 10, 300) ||
    !bounded(offsetX, -100, 100) ||
    !Number.isInteger(segments) ||
    !bounded(segments, 24, 256)
  )
    throw Error('INVALID_LOFT');
  const ring = (rx: number, rz: number, y: number, cx: number) =>
    Array.from({ length: segments }, (_, s) => {
      const a = (2 * Math.PI * s) / segments;
      return [cx + rx * Math.cos(a), y, rz * Math.sin(a)];
    }).flat();
  return cappedRings([ring(bottomX, bottomZ, 0, 0), ring(topX, topZ, height, offsetX)], segments);
}
export interface ArcSweepOptions {
  pathRadius: number;
  tubeRadius: number;
  angleDeg: number;
  segments?: number;
  steps?: number;
}
/** Circular section swept along a planar arc using its rotation-minimising frame.
 * Y is tangent at the start, Z is the fixed binormal. r < R forbids folding.
 */
export function buildArcSweep({
  pathRadius,
  tubeRadius,
  angleDeg,
  segments = 64,
  steps = 96,
}: ArcSweepOptions): Mesh {
  if (
    !bounded(pathRadius, 20, 150) ||
    !bounded(tubeRadius, 2, 30) ||
    tubeRadius > pathRadius / 2 ||
    !bounded(angleDeg, 15, 270) ||
    !Number.isInteger(segments) ||
    !bounded(segments, 24, 128) ||
    !Number.isInteger(steps) ||
    !bounded(steps, 12, 192)
  )
    throw Error('INVALID_SWEEP');
  const angle = (angleDeg * Math.PI) / 180;
  const rings = Array.from({ length: steps + 1 }, (_, i) => {
    const t = (angle * i) / steps,
      cx = pathRadius * (1 - Math.cos(t)),
      cy = pathRadius * Math.sin(t);
    return Array.from({ length: segments }, (_, s) => {
      const a = (2 * Math.PI * s) / segments,
        n = tubeRadius * Math.cos(a);
      return [cx + n * Math.cos(t), cy - n * Math.sin(t), tubeRadius * Math.sin(a)];
    }).flat();
  });
  return cappedRings(rings, segments);
}
