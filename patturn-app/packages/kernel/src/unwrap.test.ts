import { describe, expect, it } from 'vitest';
import { revolve } from './revolve.js';
import { validateMesh } from './mesh-validate.js';
import { unwrapCylinder } from './unwrap.js';
import { referenceOuterProfile } from './profile.js';

const form = revolve(referenceOuterProfile(), { segments: 96, closeBottom: true, closeTop: true });

describe('unwrap (cylindrical UV)', () => {
  it('U1: mesh is valid before unwrap', () => {
    expect(validateMesh(form).ok).toBe(true);
  });

  it('U2: circumference snaps to integer tile count', () => {
    const r = unwrapCylinder(form, { tileW: 40 });
    expect(r.circumference % 40).toBeCloseTo(0, 6);
    expect(r.tileCount).toBeGreaterThanOrEqual(1);
    // raw circumference ≈ π(rMax+rMin) = π(72.5+…) for the form
    expect(r.circumference).toBeGreaterThan(300);
    expect(r.circumference).toBeLessThan(600);
  });

  it('U3: v spans the form height in mm', () => {
    const r = unwrapCylinder(form);
    let vMin = Infinity;
    let vMax = -Infinity;
    for (let i = 1; i < r.uvs.length; i += 2) {
      vMin = Math.min(vMin, r.uvs[i]!);
      vMax = Math.max(vMax, r.uvs[i]!);
    }
    expect(vMin).toBeCloseTo(0, 5);
    expect(vMax).toBeCloseTo(148, 3); // H=144 + floor 4mm below y=0 → height 148
  });

  it('U4: distortion is finite, curvature-aware and reported', () => {
    const r = unwrapCylinder(form, { tileW: 40 });
    // walls are not a cylinder → distortion > 0 but bounded (r varies ~1.6×)
    expect(r.distortion).toBeGreaterThan(0.01);
    expect(r.distortion).toBeLessThan(1);
    expect(r.meanDistortion).toBeLessThanOrEqual(r.distortion);
    expect(r.cornerUvs.length).toBe((form.indices.length / 3) * 3 * 2);
  });

  it('U5: seam continuity — no triangle spans more than half circumference', () => {
    const r = unwrapCylinder(form, { tileW: 40 });
    const L = r.circumference;
    const c = r.cornerUvs;
    for (let t = 0; t < form.indices.length / 3; t++) {
      const u0 = c[t * 6]!;
      const u1 = c[t * 6 + 2]!;
      const u2 = c[t * 6 + 4]!;
      expect(Math.abs(u1 - u0)).toBeLessThanOrEqual(L / 2 + 1e-6);
      expect(Math.abs(u2 - u0)).toBeLessThanOrEqual(L / 2 + 1e-6);
    }
  });
});
