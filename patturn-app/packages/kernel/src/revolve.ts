/**
 * Revolve — surface of revolution → watertight triangle mesh.
 * Mesh contract: positions xyz (mm), indices CCW-outward (right-hand rule).
 * Handles apex rings (r ≈ 0) with a single shared vertex (no degenerate tris).
 */
import type { Profile } from './profile.js';

export interface Mesh {
  positions: Float32Array; // xyz triples, mm
  indices: Uint32Array; // triangles, CCW outward
  meta?: { volumeMm3?: number; bbox?: [[number, number, number], [number, number, number]] };
}

export interface RevolveOptions {
  segments?: number; // around Y (default 96)
  closeBottom?: boolean; // cap floor (default true)
  closeTop?: boolean; // cap rim (default false — open vessel)
}

const EPS = 1e-9;

export function revolve(profile: Profile, opts: RevolveOptions = {}): Mesh {
  const seg = opts.segments ?? 96;
  if (seg < 3) throw new Error('segments >= 3');
  if (profile.length < 2) throw new Error('profile too short');

  const positions: number[] = [];
  const indices: number[] = [];

  // Build vertex layout: apex (single vertex) or ring (seg vertices) per profile point.
  type Entry = { kind: 'apex'; index: number } | { kind: 'ring'; start: number };
  const layout: Entry[] = [];
  for (const { r, y } of profile) {
    if (r < EPS) {
      layout.push({ kind: 'apex', index: positions.length / 3 });
      positions.push(0, y, 0);
    } else {
      const start = positions.length / 3;
      for (let s = 0; s < seg; s++) {
        const a = (s / seg) * Math.PI * 2;
        positions.push(r * Math.cos(a), y, r * Math.sin(a));
      }
      layout.push({ kind: 'ring', start });
    }
  }

  const ringAt = (i: number) => {
    const e = layout[i]!;
    if (e.kind !== 'ring') throw new Error(`expected ring at ${i}`);
    return e.start;
  };

  // Side surfaces between consecutive entries
  for (let i = 0; i < layout.length - 1; i++) {
    const A = layout[i]!,
      B = layout[i + 1]!;
    if (A.kind === 'ring' && B.kind === 'ring') {
      const a0 = A.start,
        b0 = B.start;
      for (let s = 0; s < seg; s++) {
        const s2 = (s + 1) % seg;
        const a = a0 + s,
          b = a0 + s2,
          c = b0 + s2,
          d = b0 + s;
        indices.push(a, c, b, a, d, c);
      }
    } else if (A.kind === 'apex' && B.kind === 'ring') {
      // fan from bottom apex upward — outward/down normals
      const b0 = B.start;
      for (let s = 0; s < seg; s++) {
        const s2 = (s + 1) % seg;
        indices.push(A.index, b0 + s, b0 + s2);
      }
    } else if (A.kind === 'ring' && B.kind === 'apex') {
      // fan to top apex
      const a0 = A.start;
      for (let s = 0; s < seg; s++) {
        const s2 = (s + 1) % seg;
        indices.push(B.index, a0 + s2, a0 + s);
      }
    }
    // apex → apex: nothing (zero-length segment)
  }

  // Flat bottom cap when profile starts with a ring (no apex) and closeBottom
  const first = layout[0]!;
  if (opts.closeBottom !== false && first.kind === 'ring') {
    const center = positions.length / 3;
    const y = profile[0]!.y;
    positions.push(0, y, 0);
    for (let s = 0; s < seg; s++) {
      const s2 = (s + 1) % seg;
      indices.push(center, first.start + s, first.start + s2); // normal -Y
    }
  }

  // Flat top cap when profile ends with a ring and closeTop
  const last = layout[layout.length - 1]!;
  if (opts.closeTop && last.kind === 'ring') {
    const center = positions.length / 3;
    const y = profile[profile.length - 1]!.y;
    positions.push(0, y, 0);
    for (let s = 0; s < seg; s++) {
      const s2 = (s + 1) % seg;
      indices.push(center, last.start + s2, last.start + s); // normal +Y
    }
  }

  const mesh: Mesh = {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
  const vol = signedVolume(mesh);
  mesh.meta = { volumeMm3: vol };
  return mesh;
}

/** Signed volume via divergence theorem (positive if outward normals). */
export function signedVolume(m: Mesh): number {
  const p = m.positions,
    idx = m.indices;
  let v = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i]! * 3,
      b = idx[i + 1]! * 3,
      c = idx[i + 2]! * 3;
    const ax = p[a]!,
      ay = p[a + 1]!,
      az = p[a + 2]!;
    const bx = p[b]!,
      by = p[b + 1]!,
      bz = p[b + 2]!;
    const cx = p[c]!,
      cy = p[c + 1]!,
      cz = p[c + 2]!;
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}
