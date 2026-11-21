import { Spherical, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { orbitOffset } from './camera-orbit';

describe('Bounded camera orbit', () => {
  it('preserves radius and does not mutate the source offset', () => {
    const source = new Vector3(180, 86, 240),
      before = source.clone();
    const next = orbitOffset(source, Math.PI / 12, -Math.PI / 12);
    expect(source).toEqual(before);
    expect(next.length()).toBeCloseTo(source.length(), 10);
    expect(next).not.toEqual(source);
  });
  it.each([-100, 100])('clamps repeated vertical movement %s away from the poles', (pitch) => {
    let next = new Vector3(10, 10, 10);
    for (let i = 0; i < 100; i++) next = orbitOffset(next, 0, pitch);
    const angle = new Spherical().setFromVector3(next).phi;
    expect(angle).toBeGreaterThanOrEqual(0.00999);
    expect(angle).toBeLessThanOrEqual(Math.PI - 0.00999);
    expect(next.length()).toBeCloseTo(Math.sqrt(300), 9);
  });
  it('reverses ordinary yaw and pitch changes without radius drift', () => {
    const source = new Vector3(180, 86, 240);
    const back = orbitOffset(orbitOffset(source, 0.2, 0.1), -0.2, -0.1);
    expect(back.distanceTo(source)).toBeLessThan(1e-10);
  });
});
