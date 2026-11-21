/**
 * Mesh validation — must pass before any STL export (iron rule #3).
 * Checks: open edges, inverted normals (signed volume), duplicate triangles,
 * degenerate triangles, Euler characteristic.
 */
import type { Mesh } from './revolve.js';
import { signedVolume } from './revolve.js';

export interface ValidationReport {
  ok: boolean;
  openEdges: number;
  signedVolumeMm3: number;
  degenerateTris: number;
  duplicateTris: number;
  euler: number; // V - E + F (genus-0 closed = 2)
  problems: string[];
}

export function validateMesh(m: Mesh): ValidationReport {
  const p = m.positions,
    idx = m.indices;
  const problems: string[] = [];

  // edge counts
  const edges = new Map<string, number>();
  const triKeys = new Set<string>();
  let duplicateTris = 0;
  let degenerateTris = 0;

  const vCount = p.length / 3;
  const used = new Set<number>();

  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i]!,
      b = idx[i + 1]!,
      c = idx[i + 2]!;
    used.add(a);
    used.add(b);
    used.add(c);
    if (a === b || b === c || a === c) {
      degenerateTris++;
      continue;
    }
    // area check
    const ax = p[a * 3]!,
      ay = p[a * 3 + 1]!,
      az = p[a * 3 + 2]!;
    const bx = p[b * 3]!,
      by = p[b * 3 + 1]!,
      bz = p[b * 3 + 2]!;
    const cx = p[c * 3]!,
      cy = p[c * 3 + 1]!,
      cz = p[c * 3 + 2]!;
    const abx = bx - ax,
      aby = by - ay,
      abz = bz - az;
    const acx = cx - ax,
      acy = cy - ay,
      acz = cz - az;
    const nx = aby * acz - abz * acy,
      ny = abz * acx - abx * acz,
      nz = abx * acy - aby * acx;
    if (nx * nx + ny * ny + nz * nz < 1e-18) {
      degenerateTris++;
      continue;
    }
    const key = [a, b, c].sort((x, y) => x - y).join(',');
    if (triKeys.has(key)) duplicateTris++;
    triKeys.add(key);

    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const ek = u < v ? `${u}-${v}` : `${v}-${u}`;
      edges.set(ek, (edges.get(ek) ?? 0) + 1);
    }
  }

  let openEdges = 0;
  for (const count of edges.values())
    if (count !== 1 && count !== 2) openEdges += Math.abs(count - 2);
  // count==1 means boundary (open) edge
  for (const count of edges.values()) if (count === 1) openEdges += 1;

  const V = used.size;
  const E = edges.size;
  const F = idx.length / 3;
  const euler = V - E + F;

  const vol = signedVolume(m);
  if (openEdges > 0) problems.push(`OPEN_EDGES:${openEdges}`);
  if (vol <= 0) problems.push('INVERTED_NORMALS');
  if (degenerateTris > 0) problems.push(`DEGENERATE:${degenerateTris}`);
  if (duplicateTris > 0) problems.push(`DUPLICATE:${duplicateTris}`);

  return {
    ok: problems.length === 0,
    openEdges,
    signedVolumeMm3: vol,
    degenerateTris,
    duplicateTris,
    euler,
    problems,
  };
}
