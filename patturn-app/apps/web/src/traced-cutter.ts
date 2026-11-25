import { validateOrthogonalCutterFile } from './orthogonal-cutter-file';
import {
  buildConvexCutter,
  buildOrthogonalCutter,
  orthogonalCutterProfile,
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

/** One exact current contour; never drop holes, take a hull, or repair diagonals. */
export function tracedOrthogonalCutterGeometry(
  contours: readonly (readonly CutterPoint[])[],
  options: ConvexCutterOptions,
) {
  if (contours.length !== 1) throw Error('CUTTER_TRACE_REQUIRE_SINGLE_CONTOUR');
  const profile = orthogonalCutterProfile(contours[0]!, options);
  const mesh = buildOrthogonalCutter(contours[0]!, options);
  return { profile, mesh, report: validateMesh(mesh) };
}

/** Detached settings snapshot, preserving every source coordinate and the current dimensions. */
export function snapshotTracedOrthogonalCutter(
  contours: readonly (readonly CutterPoint[])[],
  options: ConvexCutterOptions,
) {
  const result = tracedOrthogonalCutterGeometry(contours, options);
  if (!result.report.ok) throw Error('CUTTER_TRACE_INVALID_MESH');
  return validateOrthogonalCutterFile({
    format: 'patturn-orthogonal-cutter',
    version: 1,
    units: 'mm',
    ...options,
    points: contours[0],
  });
}
