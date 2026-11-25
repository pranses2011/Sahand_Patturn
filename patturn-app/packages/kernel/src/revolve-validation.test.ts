import { describe, expect, it, vi } from 'vitest';
import { revolve, REVOLVE_LIMITS, type RevolveOptions } from './revolve';
import { referenceOuterProfile, type Profile } from './profile';
import { validateMesh } from './mesh-validate';
const cylinder: Profile = [
  { r: 10, y: 0 },
  { r: 10, y: 20 },
];
describe('revolve allocation and coordinate preflight', () => {
  it.each([NaN, Infinity, -Infinity, -1, 0, 2, 3.5, 4097, Number.MAX_SAFE_INTEGER])(
    'rejects invalid segments %s before loops',
    (segments) => {
      expect(() => revolve(cylinder, { segments })).toThrow('REVOLVE_INVALID_SEGMENTS');
    },
  );
  it.each([NaN, Infinity, -Infinity, -1, 1e39])('rejects invalid radii %s', (r) => {
    expect(() => revolve([{ r, y: 0 }, cylinder[1]!])).toThrow('REVOLVE_INVALID_COORDINATE');
  });
  it.each([NaN, Infinity, -Infinity, 1e39, -1e39])(
    'rejects invalid or Float32-overflowing heights %s',
    (y) => {
      expect(() => revolve([{ r: 10, y }, cylinder[1]!])).toThrow('REVOLVE_INVALID_COORDINATE');
    },
  );
  it('rejects missing, sparse and over-limit profiles', () => {
    for (const p of [
      [],
      [cylinder[0]!],
      new Array(2),
      Array.from({ length: REVOLVE_LIMITS.profilePoints + 1 }, () => cylinder[0]!),
      null,
    ])
      expect(() => revolve(p as Profile)).toThrow(/REVOLVE_INVALID_(PROFILE_LENGTH|COORDINATE)/);
  });
  it('rejects nonboolean cap options rather than treating strings as true', () => {
    for (const opts of [{ closeTop: 'false' }, { closeBottom: 1 }])
      expect(() => revolve(cylinder, opts as unknown as RevolveOptions)).toThrow(
        'REVOLVE_INVALID_CAP_OPTIONS',
      );
  });
  it('rejects total mesh cost even when segment and profile counts are individually permitted', () => {
    const profile = Array.from({ length: 62 }, (_, y) => ({ r: 10, y }));
    expect(() => revolve(profile, { segments: 4096, closeTop: true })).toThrow(
      'REVOLVE_MESH_LIMIT',
    );
  });
  it('rejects oversized output before trigonometry or output generation', () => {
    const trig = vi.spyOn(Math, 'cos');
    try {
      const profile = Array.from({ length: 62 }, (_, y) => ({ r: 10, y }));
      expect(() => revolve(profile, { segments: 4096 })).toThrow('REVOLVE_MESH_LIMIT');
      expect(trig).not.toHaveBeenCalled();
    } finally {
      trig.mockRestore();
    }
  });
  it.each([false, true])('preserves both apex fans with closeTop=%s', (closeTop) => {
    const mesh = revolve(
      [
        { r: 0, y: 0 },
        { r: 10, y: 10 },
        { r: 0, y: 20 },
      ],
      { segments: 96, closeTop },
    );
    expect(mesh.positions.length / 3).toBe(98);
    expect(mesh.indices.length / 3).toBe(192);
    expect(validateMesh(mesh).ok).toBe(true);
  });
  it.each([false, true])(
    'preserves uncapped versus capped rings with closeBottom=%s',
    (closeBottom) => {
      const mesh = revolve(cylinder, { segments: 96, closeBottom, closeTop: false });
      expect(mesh.positions.length / 3).toBe(192 + Number(closeBottom));
      expect(mesh.indices.length / 3).toBe(192 + 96 * Number(closeBottom));
    },
  );
  it('counts apex vertices rather than pessimistically charging a full ring', () => {
    const profile = Array.from({ length: 8192 }, (_, y) => ({ r: 0, y }));
    const mesh = revolve(profile, { segments: 4096 });
    expect(mesh.positions.length / 3).toBe(8192);
    expect(mesh.indices.length).toBe(0);
    // Structural input acceptance is not a claim that this degenerate profile is printable.
    expect(validateMesh(mesh).ok).toBe(false);
  });
  it.each([3, 96, 4096])('preserves closed cylinder topology at %i segments', (segments) => {
    const mesh = revolve(cylinder, { segments, closeTop: true });
    expect(mesh.positions.length / 3).toBe(2 * segments + 2);
    expect(mesh.indices.length / 3).toBe(4 * segments);
    expect(validateMesh(mesh).ok).toBe(true);
  });
  it('preserves deterministic reference geometry and caller-owned input', () => {
    const profile = referenceOuterProfile(32),
      before = structuredClone(profile);
    const a = revolve(profile, { segments: 96, closeTop: true });
    expect(revolve(profile, { segments: 96, closeTop: true })).toEqual(a);
    expect(profile).toEqual(before);
    expect(validateMesh(a).ok).toBe(true);
  });
});
