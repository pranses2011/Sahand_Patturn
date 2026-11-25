import type { CutterPoint, ConvexCutterOptions } from '@patturn/kernel';
import type { ExportResult } from './index.js';
function cancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw Error('EXPORT_CANCELLED');
}
/** Snapshot BEFORE importing the optional exporter; no caller-owned data crosses that async boundary. */
export async function toLazyOrthogonalCutterPdf(
  input: readonly CutterPoint[],
  options: ConvexCutterOptions,
  signal?: AbortSignal,
): Promise<ExportResult> {
  try {
    cancelled(signal);
    if (input.length > 65) throw Error('ORTHOGONAL_PDF_LIMIT');
    const points = input.map(([x, y]): CutterPoint => [x, y]),
      settings = { heightMm: options.heightMm, wallMm: options.wallMm, tipMm: options.tipMm };
    const { toOrthogonalCutterPdf } = await import('./orthogonal-cutter-pdf.js');
    cancelled(signal);
    return await toOrthogonalCutterPdf(points, settings, signal);
  } catch (error) {
    return { ok: false, filename: '', error: String(error) };
  }
}
export async function toLazyRibPdf(
  input: readonly (readonly [number, number])[],
  thickness: number,
  signal?: AbortSignal,
): Promise<ExportResult> {
  try {
    cancelled(signal);
    if (input.length > 512) throw Error('RIB_CONTACT_LIMIT');
    const contact = input.map(([x, y]): [number, number] => [x, y]);
    const { toRibPdf } = await import('./rib-pdf.js');
    cancelled(signal);
    return await toRibPdf(contact, thickness, signal);
  } catch (error) {
    return { ok: false, filename: '', error: String(error) };
  }
}
