import {
  buildOrthogonalCutter,
  orthogonalCutterProfile,
  validateMesh,
  type CutterPoint,
  type ConvexCutterOptions,
} from '@patturn/kernel';
import type { ExportResult } from './index.js';

/** Single exact inner boundary, X/Z -> DXF X/Y, translated only. No wall/handle geometry. */
export function toOrthogonalCutterDxf(
  input: readonly CutterPoint[],
  options: ConvexCutterOptions,
): ExportResult {
  try {
    const profile = orthogonalCutterProfile(input, options);
    if (!validateMesh(buildOrthogonalCutter(input, options)).ok) throw Error('INVALID_MESH');
    // Keep original orientation/order/decimals, not the centered kernel representation.
    const points = input.slice();
    if (points[0]![0] === points.at(-1)![0] && points[0]![1] === points.at(-1)![1]) points.pop();
    const minX = Math.min(...points.map((p) => p[0])),
      minY = Math.min(...points.map((p) => p[1]));
    const lines: string[] = [];
    const push = (...values: (string | number)[]) =>
      lines.push(...values.map((value) => (Object.is(value, -0) ? '0' : String(value))));
    push(999, 'Patturn inner boundary only; units: mm; scale: 1; X/Z to X/Y; translation only');
    // R2000 explicitly supports $INSUNITS=4 (millimetres); $MEASUREMENT alone is not sufficient.
    push(
      0,
      'SECTION',
      2,
      'HEADER',
      9,
      '$ACADVER',
      1,
      'AC1015',
      9,
      '$INSUNITS',
      70,
      4,
      9,
      '$MEASUREMENT',
      70,
      1,
      0,
      'ENDSEC',
    );
    push(
      0,
      'SECTION',
      2,
      'TABLES',
      0,
      'TABLE',
      2,
      'LAYER',
      100,
      'AcDbSymbolTable',
      70,
      1,
      0,
      'LAYER',
      100,
      'AcDbSymbolTableRecord',
      100,
      'AcDbLayerTableRecord',
      2,
      'INNER_BOUNDARY',
      70,
      0,
      62,
      7,
      6,
      'CONTINUOUS',
      0,
      'ENDTAB',
      0,
      'ENDSEC',
    );
    push(
      0,
      'SECTION',
      2,
      'ENTITIES',
      0,
      'LWPOLYLINE',
      100,
      'AcDbEntity',
      8,
      'INNER_BOUNDARY',
      100,
      'AcDbPolyline',
      90,
      points.length,
      70,
      1,
    );
    for (const [x, y] of points) push(10, x - minX, 20, y - minY);
    push(0, 'ENDSEC', 0, 'EOF');
    return {
      ok: true,
      filename: `orthogonal-cutter_inner-boundary_W${profile.width}-D${profile.depth}mm.dxf`,
      bytes: new TextEncoder().encode(lines.join('\n') + '\n'),
    };
  } catch {
    return { ok: false, filename: '', error: 'ORTHOGONAL_CUTTER_DXF_INVALID_GEOMETRY' };
  }
}
