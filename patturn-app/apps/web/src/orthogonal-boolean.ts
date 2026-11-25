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
