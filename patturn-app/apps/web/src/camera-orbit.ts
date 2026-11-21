import { MathUtils, Spherical, Vector3 } from 'three';

/** Orbit around world Y; avoid the polar singularities without mutating the input. */
export function orbitOffset(offset: Vector3, yaw: number, pitch: number): Vector3 {
  const spherical = new Spherical().setFromVector3(offset);
  spherical.theta += yaw;
  spherical.phi = MathUtils.clamp(spherical.phi + pitch, 0.01, Math.PI - 0.01);
  return new Vector3().setFromSpherical(spherical);
}
