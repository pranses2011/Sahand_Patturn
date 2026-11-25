import { buildOrthogonalCutter } from '@patturn/kernel';
import {
  toBuildZip,
  toOrthogonalCutterSvg,
  toOrthogonalCutterPdf,
  type ExportResult,
} from '@patturn/exporters';
import { readOrthogonalCutterFile, writeOrthogonalCutterFile } from './orthogonal-cutter-file';

/** Independent tool archive, not ProjectDoc or the global manufacturing bundle. */
export async function toOrthogonalCutterBundle(
  file: Uint8Array,
  instructions: string,
  signal?: AbortSignal,
  exportOptions: { includePdf?: boolean } = {},
): Promise<ExportResult> {
  try {
    if (signal?.aborted) throw Error('EXPORT_CANCELLED');
    if (file.byteLength > 65536) throw Error('ORTHOGONAL_FILE_TOO_LARGE');
    // Decode and copy before the first asynchronous compression boundary.
    const doc = readOrthogonalCutterFile(new TextDecoder('utf-8', { fatal: true }).decode(file));
    const includePdf = exportOptions.includePdf ?? false;
    if (typeof includePdf !== 'boolean') throw Error('ORTHOGONAL_BUNDLE_INVALID_OPTIONS');
    const options = { heightMm: doc.heightMm, wallMm: doc.wallMm, tipMm: doc.tipMm };
    const svg = toOrthogonalCutterSvg(doc.points);
    if (!svg.ok || !svg.bytes) throw Error('ORTHOGONAL_BUNDLE_INVALID');
    const files = [
      { path: 'cutter.orthogonal.json', bytes: writeOrthogonalCutterFile(doc) },
      { path: 'boundaries/inner.svg', bytes: svg.bytes },
    ];
    if (includePdf) {
      const pdf = await toOrthogonalCutterPdf(doc.points, options, signal);
      if (signal?.aborted) throw Error('EXPORT_CANCELLED');
      if (!pdf.ok || !pdf.bytes) throw Error(pdf.error ?? 'ORTHOGONAL_BUNDLE_PDF_FAILED');
      files.push({ path: 'boundaries/inner-A4-1to1.pdf', bytes: pdf.bytes });
    }
    return await toBuildZip(
      {
        project: 'orthogonal-cutter',
        meshes: [{ path: 'parts/cutter.stl', mesh: buildOrthogonalCutter(doc.points, options) }],
        files,
        orthogonalCutterBoundaries: [{ path: 'boundaries/inner.dxf', points: doc.points, options }],
        instructions,
      },
      signal,
    );
  } catch (error) {
    return { ok: false, filename: '', error: String(error) };
  }
}
