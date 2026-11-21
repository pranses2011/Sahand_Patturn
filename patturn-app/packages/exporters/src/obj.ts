import { validateMesh, type Mesh } from '@patturn/kernel';
import { exportName, type ExportResult } from './index.js';

export interface ObjPart {
  name: string;
  mesh: Mesh;
  /** RGB 0..1, written using the common v x y z r g b extension (not MTL). */
  color?: [number, number, number];
}

/** Named, indexed, assembly-space OBJ. No unit conversion or display offsets. */
export function toObj(parts: ObjPart[], project = 'patturn'): ExportResult {
  const fail = (error: string): ExportResult => ({ ok: false, filename: '', error });
  if (!parts.length) return fail('OBJ_NO_PARTS');
  // Validate everything before emitting any bytes.
  for (const part of parts) {
    if (part.mesh.positions.length % 3 !== 0 || part.mesh.indices.length % 3 !== 0) return fail('OBJ_INVALID_ARRAY_LENGTH');
    if (!part.mesh.positions.every(Number.isFinite)) return fail('OBJ_NONFINITE_POSITION');
    if (part.mesh.indices.some((i) => i >= part.mesh.positions.length / 3)) return fail('OBJ_INDEX_OUT_OF_RANGE');
    const report = validateMesh(part.mesh);
    if (!report.ok) return fail(`MESH_INVALID:${part.name}:${report.problems.join(',')}`);
    if (part.color && (part.color.length !== 3 || !part.color.every((c) => Number.isFinite(c) && c >= 0 && c <= 1))) return fail('OBJ_INVALID_COLOR');
  }
  const lines = [
    '# Patturn OBJ — units: mm; assembly coordinates; scale: 1',
    '# Colors use the optional vertex RGB extension, not MTL; some viewers ignore it.',
    '# No shrink or display translation is applied by this exporter.',
  ];
  const number = (n: number) => Object.is(n, -0) ? '0' : String(n);
  let offset = 1;
  parts.forEach((part, index) => {
    // Prefix with part index to keep object names unique after sanitization.
    const name = `${index + 1}-${part.name.normalize('NFC').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '').slice(0, 80) || 'part'}`;
    lines.push(`o ${name}`);
    const color = part.color?.map(number).join(' ');
    const p = part.mesh.positions;
    for (let i = 0; i < p.length; i += 3) lines.push(`v ${number(p[i]!)} ${number(p[i + 1]!)} ${number(p[i + 2]!)}${color ? ` ${color}` : ''}`);
    const idx = part.mesh.indices;
    for (let i = 0; i < idx.length; i += 3) lines.push(`f ${idx[i]! + offset} ${idx[i + 1]! + offset} ${idx[i + 2]! + offset}`);
    offset += p.length / 3;
  });
  return { ok: true, filename: exportName(project, 'assembly', 'mm', 'obj'), bytes: new TextEncoder().encode(lines.join('\n') + '\n') };
}
