import { describe, it, expect } from 'vitest';
import { referenceOuterProfile, revolve, validateMesh } from '@patturn/kernel';
import { buildSingleMold, buildMotherMold, buildSplitMold } from './csg.js';
import { chooseSplitPlanes } from './index.js';
import { toBinaryStl } from '@patturn/exporters';

const makeMaster = () =>
  buildSingleMold(
    revolve(referenceOuterProfile(16), {
      segments: 24,
      closeBottom: true,
      closeTop: true,
    }),
  );

describe('Mother — rectangular casting jacket', () => {
  it('J1: exact positive master and two closed printable flanged halves', async () => {
    const master = await makeMaster();
    const result = await buildMotherMold(master);
    expect(result.master).toBe(master);
    expect(result.jacket).toHaveLength(2);
    for (const mesh of [...result.jacket, result.castingSpace]) {
      expect(validateMesh(mesh).ok).toBe(true);
      expect(toBinaryStl(mesh).ok).toBe(true);
    }
    // Symmetric cavity and ports produce equal jacket half volumes.
    expect(result.jacket[0].meta!.volumeMm3!).toBeCloseTo(result.jacket[1].meta!.volumeMm3!, -1);
  });

  it('J2: silicone estimate uses casting volume minus exact master, not shell material', async () => {
    const master = await makeMaster();
    const result = await buildMotherMold(master);
    const { min, max } = result.cavityBounds;
    const expected =
      (max[0] - min[0]) * (max[1] - min[1]) * (max[2] - min[2]) - master.meta!.volumeMm3!;
    expect(result.siliconeVolumeMm3).toBeCloseTo(expected, -1);
    expect(result.siliconeKg).toBeCloseTo((expected / 1e6) * 1.15, 5);
    expect(result.siliconeKg).toBeGreaterThan(0);
    const larger = await buildMotherMold(master, { barrierMm: 4 });
    expect(larger.siliconeVolumeMm3).toBeGreaterThan(result.siliconeVolumeMm3);
  });

  it('J3: wall and flange change jacket material without changing casting volume', async () => {
    const master = await makeMaster();
    const a = await buildMotherMold(master);
    const b = await buildMotherMold(master, { wallMm: 12, flangeMm: 20 });
    expect(a.siliconeVolumeMm3).toBeCloseTo(b.siliconeVolumeMm3, 5);
    expect(b.jacket[0].meta!.volumeMm3!).toBeGreaterThan(a.jacket[0].meta!.volumeMm3!);
  });

  it('J4: rejects invalid options and invalid masters', async () => {
    const master = await makeMaster();
    for (const opts of [
      { barrierMm: 0 },
      { wallMm: -1 },
      { sprueDia: NaN },
      { siliconeDensity: Infinity },
    ]) {
      await expect(buildMotherMold(master, opts)).rejects.toThrow('MOTHER_INVALID_OPTIONS');
    }
    await expect(buildMotherMold(master, { sprueDia: 500 })).rejects.toThrow(
      'MOTHER_PORTS_DO_NOT_FIT',
    );
    await expect(
      buildMotherMold({ positions: new Float32Array(), indices: new Uint32Array() }),
    ).rejects.toThrow('MOTHER_INVALID_MASTER');
  });
  it('J5: jackets accept keyed horizontal and vertical mold parts', async () => {
    const profiles = [
      referenceOuterProfile(16),
      [
        { r: 30, y: 0 },
        { r: 60, y: 50 },
        { r: 65, y: 70 },
        { r: 40, y: 130 },
        { r: 45, y: 150 },
      ],
    ];
    for (const profile of profiles) {
      const form = revolve(profile, { segments: 24, closeBottom: true, closeTop: true });
      const parts = await buildSplitMold(form, chooseSplitPlanes(profile), { profile });
      for (const part of parts) {
        const result = await buildMotherMold(part);
        expect(result.siliconeVolumeMm3).toBeGreaterThan(0);
        for (const half of result.jacket) expect(validateMesh(half).ok).toBe(true);
      }
    }
  });
});
