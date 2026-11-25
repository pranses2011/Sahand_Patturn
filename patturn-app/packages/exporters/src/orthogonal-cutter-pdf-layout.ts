import {
  orthogonalCutterProfile,
  buildOrthogonalCutter,
  validateMesh,
  type CutterPoint,
  type ConvexCutterOptions,
} from '@patturn/kernel';
/** Maximum 150mm contour fits on one A4 page without scaling or tiling. Inner boundary only. */
export function orthogonalCutterPdfLayout(
  points: readonly CutterPoint[],
  options: ConvexCutterOptions,
) {
  const profile = orthogonalCutterProfile(points, options);
  if (!validateMesh(buildOrthogonalCutter(points, options)).ok)
    throw Error('ORTHOGONAL_PDF_INVALID_MESH');
  const minX = Math.min(...profile.points.map((p) => p[0])),
    minY = Math.min(...profile.points.map((p) => p[1]));
  return {
    width: profile.width,
    height: profile.depth,
    points: profile.points.map(([x, y]): [number, number] => [x - minX, y - minY]),
  };
}
