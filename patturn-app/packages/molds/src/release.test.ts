import { describe, expect, it } from 'vitest';
import { initCsg, buildBlock, toValidatedMesh, analyzeMotherRelease } from './csg.js';

async function box(z0: number, z1: number) {
  await initCsg();
  const native = buildBlock({ min: [-1, -1, z0], max: [1, 1, z1], wall: 0, base: 0, draftDeg: 0 });
  try { return toValidatedMesh(native); } finally { native.delete?.(); }
}

describe('Sampled rigid release', () => {
  it('R1: clear outward motion reports samples, never certifies release', async () => {
    const report = await analyzeMotherRelease(await box(-1, 1), [await box(-3, -2), await box(2, 3)]);
    expect(report.certified).toBe(false);
    expect(report.samplesMm[0]).toBe(0);
    expect(report.samplesMm.at(-1)).toBe(8);
    expect(report.halves.map((p) => p.direction)).toEqual(['-z', '+z']);
    for (const half of report.halves) {
      expect(half.status).toBe('no-collision-at-samples');
      expect(half.firstCollisionMm).toBeNull();
      expect(half.maxMasterOverlapMm3).toBe(0);
      expect(half.maxOtherHalfOverlapMm3).toBe(0);
    }
  });

  it('R2: catches an intermediate collision even when start and final poses are clear', async () => {
    const report = await analyzeMotherRelease(await box(-1, 1), [await box(2, 3), await box(6, 7)], { samplesMm: [0, 2, 10] });
    expect(report.halves[0]!.status).toBe('collision-detected');
    expect(report.halves[0]!.firstCollisionMm).toBe(2);
    expect(report.halves[0]!.maxMasterOverlapMm3).toBeCloseTo(4, 4);
    expect(report.halves[1]!.status).toBe('no-collision-at-samples');
  });

  it('R3: checks the stationary other half, not only the master', async () => {
    const report = await analyzeMotherRelease(await box(20, 21), [await box(3, 4), await box(0, 1)], { samplesMm: [0, 3] });
    expect(report.halves[0]!.maxMasterOverlapMm3).toBe(0);
    expect(report.halves[0]!.maxOtherHalfOverlapMm3).toBeCloseTo(4, 4);
    expect(report.halves[0]!.firstCollisionMm).toBe(3);
  });

  it('R4: rejects invalid samples and geometry, normalizes sample order', async () => {
    const master = await box(-1, 1), halves: [typeof master, typeof master] = [await box(-3, -2), await box(2, 3)];
    for (const opts of [{ samplesMm: [] }, { samplesMm: [0, NaN] }, { samplesMm: [-1, 2] }, { volumeToleranceMm3: -1 }]) {
      await expect(analyzeMotherRelease(master, halves, opts)).rejects.toThrow('RELEASE_INVALID_OPTIONS');
    }
    const report = await analyzeMotherRelease(master, halves, { samplesMm: [3, 1, 1] });
    expect(report.samplesMm).toEqual([0, 1, 3, 7]);
    await expect(analyzeMotherRelease({ positions: new Float32Array(), indices: new Uint32Array() }, halves)).rejects.toThrow('RELEASE_INVALID_MESH');
  });
});
