/**
 * Cylindrical unwrap — (θ,y) → (u,v) with arc-length correction + seam handling.
 * Contract (checklist 5.1 / 4.8):
 *  - u in mm along the reference circumference L (snapped to an integer number
 *    of pattern tiles so the texture closes seamlessly around the form);
 *  - v in mm from the bottom (y − yMin);
 *  - distortion: per-triangle |A₃D/A_UV − 1| (captures both horizontal stretch
 *    from r(y) variation and vertical stretch from wall slope — curvature-aware).
 * Caps (horizontal faces) have A_UV = 0 in cylindrical UV and are excluded from
 * the distortion metric (standard for cylinder projection).
 */
import type { Mesh } from './revolve.js';

export interface UnwrapResult {
  /** per-vertex [u0,v0, u1,v1, …] in mm (raw, may jump at the seam) */
  uvs: Float32Array;
  /**
   * per-corner UVs (length = indices.length × 2) with per-triangle seam
   * continuity — use with a de-indexed geometry for texture rendering.
   * Shifts are multiples of the circumference, and circumference is a multiple
   * of tileW, so RepeatWrapping keeps shared edges crack-free.
   */
  cornerUvs: Float32Array;
  /** reference circumference used for u (mm) */
  circumference: number;
  /** how many pattern tiles fit around the form (integer ≥ 1) */
  tileCount: number;
  /** max |A3D/AUV − 1| over side triangles (0.12 = 12%) */
  distortion: number;
  /** mean of the same metric */
  meanDistortion: number;
  /** triangles skipped (caps / degenerate UV) */
  skippedTriangles: number;
}

export interface UnwrapOptions {
  /** pattern tile width in mm — L snaps to a multiple of it (default: no snap) */
  tileW?: number;
}

export function unwrapCylinder(mesh: Mesh, opts: UnwrapOptions = {}): UnwrapResult {
  const { positions, indices } = mesh;
  const nV = positions.length / 3;

  // radii + angles
  let rMin = Infinity;
  let rMax = 0;
  let yMin = Infinity;
  let yMax = -Infinity;
  const r = new Float64Array(nV);
  const theta = new Float64Array(nV);
  const y = new Float64Array(nV);
  for (let i = 0; i < nV; i++) {
    const x = positions[i * 3]!;
    const yy = positions[i * 3 + 1]!;
    const z = positions[i * 3 + 2]!;
    const ri = Math.hypot(x, z);
    r[i] = ri;
    theta[i] = Math.atan2(z, x); // (−π, π]
    y[i] = yy;
    if (ri > 1e-9) {
      if (ri < rMin) rMin = ri;
      if (ri > rMax) rMax = ri;
    }
    if (yy < yMin) yMin = yy;
    if (yy > yMax) yMax = yy;
  }
  if (!Number.isFinite(rMin)) rMin = 0;

  // Minimax circumference: L = π(rMax+rMin) minimises max|2πr/L − 1|.
  // Snap to an integer number of pattern tiles so the seam wraps cleanly.
  const l0 = Math.PI * (rMax + rMin);
  let tileCount = 1;
  let circumference = l0;
  if (opts.tileW && opts.tileW > 0) {
    tileCount = Math.max(1, Math.round(l0 / opts.tileW));
    circumference = tileCount * opts.tileW;
  }

  // per-vertex UV (mm). u ∈ (−L/2, L/2] — triangle-level continuity fix below.
  const uvs = new Float32Array(nV * 2);
  for (let i = 0; i < nV; i++) {
    uvs[i * 2] = (theta[i]! / (2 * Math.PI)) * circumference;
    uvs[i * 2 + 1] = y[i]! - yMin;
  }

  // per-triangle distortion with seam continuity (shift corners by k·L so no
  // triangle spans more than half the circumference — texture never backtracks).
  const triCount = indices.length / 3;
  const cornerUvs = new Float32Array(indices.length * 2);
  let maxD = 0;
  let sumD = 0;
  let counted = 0;
  let skipped = 0;
  const cu = [0, 0, 0];
  const cv = [0, 0, 0];
  for (let t = 0; t < triCount; t++) {
    const vi = [indices[t * 3]!, indices[t * 3 + 1]!, indices[t * 3 + 2]!];
    // seam fix: make u continuous inside this triangle
    const u0 = uvs[vi[0]! * 2]!;
    for (let k = 0; k < 3; k++) {
      let u = uvs[vi[k]! * 2]!;
      while (u - u0 > circumference / 2) u -= circumference;
      while (u - u0 < -circumference / 2) u += circumference;
      cu[k] = u;
      cv[k] = uvs[vi[k]! * 2 + 1]!;
      cornerUvs[(t * 3 + k) * 2] = u;
      cornerUvs[(t * 3 + k) * 2 + 1] = cv[k]!;
    }
    // UV area (shoelace, mm²)
    const auv =
      Math.abs((cu[1]! - cu[0]!) * (cv[2]! - cv[0]!) - (cu[2]! - cu[0]!) * (cv[1]! - cv[0]!)) / 2;
    if (auv < 1e-9) {
      skipped++; // caps & degenerate — excluded from metric
      continue;
    }
    // 3D area (cross product of edges)
    const p = (k: number) => vi[k]!;
    const ax = positions[p(1)! * 3]! - positions[p(0)! * 3]!;
    const ay = positions[p(1)! * 3 + 1]! - positions[p(0)! * 3 + 1]!;
    const az = positions[p(1)! * 3 + 2]! - positions[p(0)! * 3 + 2]!;
    const bx = positions[p(2)! * 3]! - positions[p(0)! * 3]!;
    const by = positions[p(2)! * 3 + 1]! - positions[p(0)! * 3 + 1]!;
    const bz = positions[p(2)! * 3 + 2]! - positions[p(0)! * 3 + 2]!;
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    const a3d = Math.hypot(cx, cy, cz) / 2;
    if (a3d < 1e-12) {
      skipped++;
      continue;
    }
    const d = Math.abs(a3d / auv - 1);
    if (d > maxD) maxD = d;
    sumD += d;
    counted++;
  }

  return {
    uvs,
    cornerUvs,
    circumference,
    tileCount,
    distortion: maxD,
    meanDistortion: counted > 0 ? sumD / counted : 0,
    skippedTriangles: skipped,
  };
}
