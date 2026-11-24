import { convexCutterProfile, type CutterPoint } from '@patturn/kernel';
import type { ExportResult } from './index.js';

/** Re-importable single-polygon subset. Contour only: no cutter dimensions or project state. */
export function toCutterSvg(input: readonly CutterPoint[]): ExportResult {
  try {
    convexCutterProfile(input, { heightMm: 20, wallMm: 1.6, tipMm: 0.6 });
    // Use the original coordinates (not the centered profile) to avoid a second translation.
    const points = input.slice();
    if (points[0]![0] === points.at(-1)![0] && points[0]![1] === points.at(-1)![1]) points.pop();
    const minX = Math.min(...points.map((p) => p[0])),
      minY = Math.min(...points.map((p) => p[1]));
    const width = Math.max(...points.map((p) => p[0])) - minX;
    const height = Math.max(...points.map((p) => p[1])) - minY;
    const coordinates = points.map(([x, y]) => `${x - minX},${y - minY}`).join(' ');
    // No XML declaration, styling, arbitrary strings or extra attributes: matches the importer.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}"><polygon points="${coordinates}"/></svg>\n`;
    return {
      ok: true,
      filename: `convex-cutter_contour_W${width}-D${height}mm.svg`,
      bytes: new TextEncoder().encode(svg),
    };
  } catch {
    return { ok: false, filename: '', error: 'CUTTER_SVG_INVALID_CONTOUR' };
  }
}
