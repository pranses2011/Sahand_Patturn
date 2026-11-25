import {
  booleanOrthogonalRectangle,
  type BooleanRectangle,
  type RectangleBooleanOperation,
} from '@patturn/patterns';
import {
  orthogonalCutterProfile,
  type CutterPoint,
  type ConvexCutterOptions,
} from '@patturn/kernel';
/** Do not use the result unless every ring fits the existing single-contour cutter contract. */
export function editOrthogonalRectangle(
  points: readonly CutterPoint[],
  rectangle: BooleanRectangle,
  operation: RectangleBooleanOperation,
  options: ConvexCutterOptions,
): CutterPoint[] {
  orthogonalCutterProfile(points, { heightMm: 20, wallMm: 0.8, tipMm: 0.4 });
  const contours = booleanOrthogonalRectangle(points, rectangle, operation);
  if (contours.length !== 1) throw Error('ORTHOGONAL_BOOLEAN_SINGLE_CONTOUR');
  orthogonalCutterProfile(contours[0]!, options);
  return contours[0]!;
}

/** Shared by preview and apply; a partially typed coordinate must never become zero. */
export function parseBooleanRectangle(values: readonly string[]): BooleanRectangle {
  if (values.length !== 4 || values.some((v) => !v.trim())) throw Error('ORTHOGONAL_BOOLEAN_DRAFT');
  const [x, y, width, height] = values.map(Number);
  if (
    ![x, y, width, height].every((n) => n !== undefined && Number.isFinite(n)) ||
    Math.abs(x!) > 1000 ||
    Math.abs(y!) > 1000 ||
    width! <= 0 ||
    height! <= 0 ||
    width! > 150 ||
    height! > 150
  )
    throw Error('ORTHOGONAL_BOOLEAN_DRAFT');
  return { x: x!, y: y!, width: width!, height: height! };
}
/** Non-committing drawing: retain ALL candidate rings even when the cutter rejects their topology. */
export function previewOrthogonalRectangle(
  points: readonly CutterPoint[],
  values: readonly string[],
  operation: RectangleBooleanOperation,
  options: ConvexCutterOptions,
) {
  let rectangle: BooleanRectangle | null = null,
    contours: [number, number][][] = [],
    valid = false;
  try {
    rectangle = parseBooleanRectangle(values);
  } catch {
    /* A partial rectangle is not drawn. */
  }
  if (rectangle)
    try {
      orthogonalCutterProfile(points, { heightMm: 20, wallMm: 0.8, tipMm: 0.4 });
      contours = booleanOrthogonalRectangle(points, rectangle, operation);
      if (contours.length === 1) {
        orthogonalCutterProfile(contours[0]!, options);
        valid = true;
      }
    } catch {
      /* Keep computed rings visible but explicitly invalid; never use them for export. */
    }
  const extent: readonly CutterPoint[] = [
    ...points,
    ...(rectangle
      ? ([
          [rectangle.x, rectangle.y],
          [rectangle.x + rectangle.width, rectangle.y + rectangle.height],
        ] as CutterPoint[])
      : []),
  ].filter((p) => p.every((n) => Number.isFinite(n) && Math.abs(n) <= 10000));
  const minX = extent.length ? Math.min(...extent.map((p) => p[0])) : 0,
    minY = extent.length ? Math.min(...extent.map((p) => p[1])) : 0,
    maxX = extent.length ? Math.max(...extent.map((p) => p[0])) : 150,
    maxY = extent.length ? Math.max(...extent.map((p) => p[1])) : 150;
  return {
    rectangle,
    contours,
    valid,
    box: {
      x: minX - 5,
      y: minY - 5,
      width: Math.max(10, maxX - minX + 10),
      height: Math.max(10, maxY - minY + 10),
    },
  };
}
