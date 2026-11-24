import { circularCutterProfile, convexCutterProfile, type CutterPoint } from '@patturn/kernel';

export type CutterFile = {
  format: 'patturn-cutter';
  version: 1;
  units: 'mm';
  heightMm: number;
  wallMm: number;
  tipMm: number;
  shape: { kind: 'circle'; diameterMm: number } | { kind: 'polygon'; points: CutterPoint[] };
};
const MAX_BYTES = 64 * 1024;
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('CUTTER_FILE_INVALID');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key)))
    throw Error('CUTTER_FILE_INVALID');
  return record;
}
/** Strict versioned contour/settings file. Never a ProjectDoc or a mesh/archive. */
export function validateCutterFile(value: unknown): CutterFile {
  const doc = object(value, ['format', 'version', 'units', 'heightMm', 'wallMm', 'tipMm', 'shape']);
  if (doc.format !== 'patturn-cutter' || doc.version !== 1 || doc.units !== 'mm')
    throw Error('CUTTER_FILE_UNSUPPORTED');
  for (const key of ['heightMm', 'wallMm', 'tipMm'])
    if (typeof doc[key] !== 'number') throw Error('CUTTER_FILE_INVALID');
  const options = {
    heightMm: doc.heightMm as number,
    wallMm: doc.wallMm as number,
    tipMm: doc.tipMm as number,
  };
  let shape: CutterFile['shape'];
  if ((doc.shape as { kind?: unknown } | null)?.kind === 'circle') {
    const data = object(doc.shape, ['kind', 'diameterMm']);
    if (typeof data.diameterMm !== 'number') throw Error('CUTTER_FILE_INVALID');
    circularCutterProfile({ ...options, diameterMm: data.diameterMm });
    shape = { kind: 'circle', diameterMm: data.diameterMm };
  } else {
    const data = object(doc.shape, ['kind', 'points']);
    if (data.kind !== 'polygon') throw Error('CUTTER_FILE_UNSUPPORTED');
    convexCutterProfile(data.points as CutterPoint[], options);
    shape = { kind: 'polygon', points: (data.points as CutterPoint[]).map((p) => [p[0], p[1]]) };
  }
  return { format: 'patturn-cutter', version: 1, units: 'mm', ...options, shape };
}
export function readCutterFile(text: string): CutterFile {
  if (text.length > MAX_BYTES || new TextEncoder().encode(text).length > MAX_BYTES)
    throw Error('CUTTER_FILE_TOO_LARGE');
  return validateCutterFile(JSON.parse(text));
}
export function writeCutterFile(value: CutterFile): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(validateCutterFile(value), null, 2) + '\n');
}
