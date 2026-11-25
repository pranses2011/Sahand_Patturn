import { buildOrthogonalCutter } from '@patturn/kernel';
import { toBuildZip, toOrthogonalCutterSvg, type ExportResult } from '@patturn/exporters';
import { readOrthogonalCutterFile, writeOrthogonalCutterFile } from './orthogonal-cutter-file';

/** Independent tool archive, not ProjectDoc or the global manufacturing bundle. */
export async function toOrthogonalCutterBundle(
  file: Uint8Array,
  instructions: string,
  signal?: AbortSignal,
): Promise<ExportResult> {
  try {
    if (signal?.aborted) throw Error('EXPORT_CANCELLED');
    if (file.byteLength > 65536) throw Error('ORTHOGONAL_FILE_TOO_LARGE');
    // Decode and copy before the first asynchronous compression boundary.
    const doc = readOrthogonalCutterFile(new TextDecoder('utf-8', { fatal: true }).decode(file));
    const options = { heightMm: doc.heightMm, wallMm: doc.wallMm, tipMm: doc.tipMm };
    const svg = toOrthogonalCutterSvg(doc.points);
    if (!svg.ok || !svg.bytes) throw Error('ORTHOGONAL_BUNDLE_INVALID');
    return await toBuildZip(
      {
        project: 'orthogonal-cutter',
        meshes: [{ path: 'parts/cutter.stl', mesh: buildOrthogonalCutter(doc.points, options) }],
        files: [
          { path: 'cutter.orthogonal.json', bytes: writeOrthogonalCutterFile(doc) },
          { path: 'boundaries/inner.svg', bytes: svg.bytes },
        ],
        orthogonalCutterBoundaries: [{ path: 'boundaries/inner.dxf', points: doc.points, options }],
        instructions,
      },
      signal,
    );
  } catch (error) {
    return { ok: false, filename: '', error: String(error) };
  }
}
