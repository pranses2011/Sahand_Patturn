import {
  buildConvexCutter,
  convexCutterProfile,
  validateMesh,
  type ConvexCutterOptions,
  type CutterPoint,
} from '@patturn/kernel';
/** Never select one contour or take a convex hull implicitly: preserve trace topology. */
export function tracedCutterGeometry(
  contours: readonly (readonly CutterPoint[])[],
  options: ConvexCutterOptions,
) {
  if (contours.length !== 1) throw Error('CUTTER_TRACE_REQUIRE_SINGLE_CONTOUR');
  const polygon = convexCutterProfile(contours[0]!, options);
  const mesh = buildConvexCutter(contours[0]!, options);
  return { polygon, mesh, report: validateMesh(mesh) };
}
