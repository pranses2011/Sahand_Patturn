import { Box3, MathUtils, Vector3 } from 'three';

/** Fit the bounding sphere inside both perspective frustum angles, with 15% breathing room. */
export function cameraFit(bounds: Box3, verticalFov: number, aspect: number) {
  if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray(), verticalFov, aspect].every(Number.isFinite)
    || verticalFov <= 0 || verticalFov >= 180 || aspect <= 0) return null;
  const center = bounds.getCenter(new Vector3());
  const radius = Math.max(bounds.getSize(new Vector3()).length() / 2, 0.001);
  const vertical = MathUtils.degToRad(verticalFov) / 2;
  const horizontal = Math.atan(Math.tan(vertical) * aspect);
  const distance = radius * 1.15 / Math.sin(Math.min(vertical, horizontal));
  if (!Number.isFinite(distance)) return null;
  // Do not tightly clip to the fitted pose: OrbitControls must still allow zooming
  // toward / away from the target after fitting, without slicing the model away.
  const near = Math.max(0.0001, radius / 1000);
  const far = Math.max(5000, distance + radius * 100);
  if (![near, far].every(Number.isFinite)) return null;
  return { center, distance, near, far };
}
