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
  const slug =
    project
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
    return {
      ok: false,
      filename: '',
      error: `MESH_INVALID: ${report.problems.join(',')}`,
      validation: report,
    };
  }
  const triCount = mesh.indices.length / 3;
  const buf = new ArrayBuffer(84 + triCount * 50);
  const dv = new DataView(buf);
  const header = `Patturn binary STL — ${solidName} — mm`.slice(0, 79);
  for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i) & 0x7f);
  dv.setUint32(80, triCount, true);
  const p = mesh.positions,
    idx = mesh.indices;
  let off = 84;
  for (let t = 0; t < triCount; t++) {
    const a = idx[t * 3]! * 3,
      b = idx[t * 3 + 1]! * 3,
      c = idx[t * 3 + 2]! * 3;
    // face normal
    const ux = p[b]! - p[a]!,
      uy = p[b + 1]! - p[a + 1]!,
      uz = p[b + 2]! - p[a + 2]!;
    const vx = p[c]! - p[a]!,
      vy = p[c + 1]! - p[a + 1]!,
      vz = p[c + 2]! - p[a + 2]!;
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    dv.setFloat32(off, nx, true);
    dv.setFloat32(off + 4, ny, true);
    dv.setFloat32(off + 8, nz, true);
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
  return {
    ok: true,
    filename: exportName(solidName, 'mesh', 'mm', 'stl'),
    bytes: new Uint8Array(buf),
    validation: report,
  };
}

/** SVG with explicit mm units (site contract: 100mm line = 100 user units). */
export function toSvg(
  paths: { d: string; fill?: boolean }[],
  widthMm: number,
  heightMm: number,
  options: { strokeMm?: number } = {},
): ExportResult {
  const stroke = options.strokeMm ?? 0.5;
  const filename = exportName(
    'pattern',
    'flat',
    `${Math.round(widthMm)}x${Math.round(heightMm)}`,
    'svg',
  );
  if (![widthMm, heightMm, stroke].every((n) => Number.isFinite(n) && n > 0))
    return { ok: false, filename, error: 'SVG_INVALID_DIMENSIONS_OR_STROKE' };
  // Only SVG path commands, numeric literals and separators may enter the attribute.
  // This is an output safety check, not a complete SVG path grammar parser.
  for (const p of paths) {
    const numbers = p.d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? [];
    const commands = p.d.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g, '');
    if (
      !/^[\s,]*[Mm]/.test(p.d) ||
      !/^[MmZzLlHhVvCcSsQqTtAa\s,]*$/.test(commands) ||
      numbers.some((n) => !Number.isFinite(Number(n)))
    )
      return { ok: false, filename, error: 'SVG_UNSAFE_OR_NONFINITE_PATH' };
  }
  const body = paths
    .map(
      (p) =>
        `<path d="${p.d}" ${p.fill ? 'fill="#1C1917"' : `fill="none" stroke="#1C1917" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"`}/>`,
    )
    .join('\n  ');
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}" overflow="hidden">\n` +
    `  <defs><clipPath id="canvas" clipPathUnits="userSpaceOnUse"><rect width="${widthMm}" height="${heightMm}"/></clipPath></defs>\n` +
    `  <g clip-path="url(#canvas)">\n  ${body}\n  </g>\n</svg>\n`;
  return { ok: true, filename, bytes: new TextEncoder().encode(svg) };
}

export { toDxf } from './dxf.js';

export * from './bundle.js';
export * from './dimensions.js';
export * from './obj.js';
export * from './rib-pdf.js';
export * from './extruder.js';
export { toCutterSvg, toOrthogonalCutterSvg } from './cutter-svg.js';
