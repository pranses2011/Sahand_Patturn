import { orthogonalCutterProfile, type CutterPoint } from '@patturn/kernel';
export type OrthogonalCutterFile = {
  format: 'patturn-orthogonal-cutter';
  version: 1;
  units: 'mm';
  heightMm: number;
  wallMm: number;
  tipMm: number;
  points: CutterPoint[];
};
/** Separate from the convex cutter v1 contract; never strip unknown/future data. */
export function validateOrthogonalCutterFile(value: unknown): OrthogonalCutterFile {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('ORTHOGONAL_FILE_INVALID');
  const doc = value as Record<string, unknown>,
    keys = ['format', 'version', 'units', 'heightMm', 'wallMm', 'tipMm', 'points'];
  if (Object.keys(doc).length !== keys.length || keys.some((key) => !Object.hasOwn(doc, key)))
    throw Error('ORTHOGONAL_FILE_INVALID');
  if (doc.format !== 'patturn-orthogonal-cutter' || doc.version !== 1 || doc.units !== 'mm')
    throw Error('ORTHOGONAL_FILE_UNSUPPORTED');
  if (['heightMm', 'wallMm', 'tipMm'].some((key) => typeof doc[key] !== 'number'))
    throw Error('ORTHOGONAL_FILE_INVALID');
  const options = {
    heightMm: doc.heightMm as number,
    wallMm: doc.wallMm as number,
    tipMm: doc.tipMm as number,
  };
  orthogonalCutterProfile(doc.points as CutterPoint[], options);
  return {
    format: 'patturn-orthogonal-cutter',
    version: 1,
    units: 'mm',
    ...options,
    points: (doc.points as CutterPoint[]).map((p) => [p[0], p[1]]),
  };
}
export function readOrthogonalCutterFile(text: string): OrthogonalCutterFile {
  if (text.length > 65536 || new TextEncoder().encode(text).length > 65536)
    throw Error('ORTHOGONAL_FILE_TOO_LARGE');
  return validateOrthogonalCutterFile(JSON.parse(text));
}
export function writeOrthogonalCutterFile(value: OrthogonalCutterFile): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify(validateOrthogonalCutterFile(value), null, 2) + '\n',
  );
}
