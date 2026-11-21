/**
 * Exporters — STL (binary), SVG, DXF minimal, naming contract.
 * Rule: validate mesh before any STL export; units always mm.
 */
import { validateMesh, type Mesh } from '@patturn/kernel';

export interface ExportResult {
  ok: boolean;
  filename: string;
  bytes?: Uint8Array;
  error?: string;
  validation?: ReturnType<typeof validateMesh>;
}

/** Safe filename: <name>_<target>_<dims>.stl (export naming contract). */
export function exportName(project: string, target: string, dims: string, ext: string): string {
  const slug = project
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'project';
  return `${slug}_${target}_${dims}.${ext}`;
}

/** Binary STL (little-endian). Header 80 bytes + uint32 count + 50 bytes/tri. */
export function toBinaryStl(mesh: Mesh, solidName = 'patturn'): ExportResult {
  const report = validateMesh(mesh);
  if (!report.ok) {
    return { ok: false, filename: '', error: `MESH_INVALID: ${report.problems.join(',')}`, validation: report };
  }
  const triCount = mesh.indices.length / 3;
  const buf = new ArrayBuffer(84 + triCount * 50);
  const dv = new DataView(buf);
  const header = `Patturn binary STL — ${solidName} — mm`.slice(0, 79);
  for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i) & 0x7f);
  dv.setUint32(80, triCount, true);
  const p = mesh.positions, idx = mesh.indices;
  let off = 84;
  for (let t = 0; t < triCount; t++) {
    const a = idx[t * 3]! * 3, b = idx[t * 3 + 1]! * 3, c = idx[t * 3 + 2]! * 3;
    // face normal
    const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!;
    const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    dv.setFloat32(off, nx, true); dv.setFloat32(off + 4, ny, true); dv.setFloat32(off + 8, nz, true);
    off += 12;
    for (const vi of [a, b, c]) {
      dv.setFloat32(off, p[vi]!, true);
      dv.setFloat32(off + 4, p[vi + 1]!, true);
      dv.setFloat32(off + 8, p[vi + 2]!, true);
      off += 12;
    }
    dv.setUint16(off, 0, true);
    off += 2;
  }
  return { ok: true, filename: exportName(solidName, 'mesh', 'mm', 'stl'), bytes: new Uint8Array(buf), validation: report };
}

/** SVG with explicit mm units (site contract: 100mm line = 100 user units). */
export function toSvg(paths: { d: string; fill?: boolean }[], widthMm: number, heightMm: number): ExportResult {
  const body = paths
    .map((p) => `<path d="${p.d}" ${p.fill ? 'fill="#1C1917"' : 'fill="none" stroke="#1C1917" stroke-width="0.5"'}/>`)
    .join('\n  ');
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}">\n  ${body}\n</svg>\n`;
  return { ok: true, filename: exportName('pattern', 'flat', `${Math.round(widthMm)}x${Math.round(heightMm)}`, 'svg'), bytes: new TextEncoder().encode(svg) };
}

/** Minimal DXF R12 (ENTITIES with LINE/CIRCLE) — layers: 0=outline,1=detail. */
export function toDxf(paths: { d: string; fill?: boolean }[]): ExportResult {
  // Parse only our own generated simple paths: circles (M..a..z) and polylines (M..L..)
  const lines: string[] = [];
  const push = (...xs: (string | number)[]) => lines.push(...xs.map(String));
  push(0, 'SECTION', 2, 'ENTITIES');
  for (const p of paths) {
    const circle = p.d.match(/^M([-\d.]+) ([-\d.]+)a([-\d.]+) ([-\d.]+) 0 1 0 ([-\d.]+) ([-\d.]+)a/);
    if (circle) {
      const cx = parseFloat(circle[1]!) + parseFloat(circle[3]!);
      const cy = parseFloat(circle[2]!);
      const r = Math.abs(parseFloat(circle[3]!));
      push(0, 'CIRCLE', 8, p.fill ? '0' : '1', 10, cx.toFixed(3), 20, cy.toFixed(3), 30, '0.0', 40, r.toFixed(3));
      continue;
    }
    const pairs = [...p.d.matchAll(/([ML])([-\d.]+) ([-\d.]+)/g)];
    if (pairs.length >= 2) {
      push(0, 'POLYLINE', 8, p.fill ? '0' : '1', 66, '1', 70, '0');
      for (const m of pairs) {
        push(0, "VERTEX", 8, p.fill ? "0" : "1", 10, m[2] ?? "0", 20, m[3] ?? "0", 30, "0.0");
      }
      push(0, 'SEQEND');
    }
  }
  push(0, 'ENDSEC', 0, 'EOF');
  return { ok: true, filename: exportName('pattern', 'flat', 'mm', 'dxf'), bytes: new TextEncoder().encode(lines.join('\n')) };
}

export * from './bundle.js';
