import { describe, it, expect } from 'vitest';
import { validateMesh, referenceOuterProfile, revolve } from '@patturn/kernel';
import { initCsg, buildBlock, toValidatedMesh, buildOffsetBarrier, buildSingleMold, buildSplitMold, motherAssemblyGuide, analyzeMotherRelease } from './csg.js';
import { chooseSplitPlanes } from './index.js';
import { toBinaryStl } from '@patturn/exporters';

async function cube() {
  await initCsg();
  return toValidatedMesh(buildBlock({ min: [-15, 0, -25], max: [15, 40, 25], wall: 0, base: 0, draftDeg: 0 }));
}

function extent(values: Float32Array, axis: number, mode: 'min' | 'max') {
  let value = mode === 'min' ? Infinity : -Infinity;
  for (let i = axis; i < values.length; i += 3) value = Math[mode](value, values[i]!);
  return value;
}

describe('Conformal offset barrier', () => {
  it('B1: independent closed STL halves, correct clearance/thickness at planar faces', async () => {
    const result = await buildOffsetBarrier(await cube());
    for (const half of result.halves) {
      expect(validateMesh(half).ok).toBe(true);
      expect(toBinaryStl(half).ok).toBe(true);
    }
    expect(extent(result.halves[0].positions, 2, 'max')).toBeCloseTo(0, 4);
    expect(extent(result.halves[1].positions, 2, 'min')).toBeCloseTo(0, 4);
    expect(extent(result.halves[0].positions, 0, 'max')).toBeCloseTo(19, 4);
    expect(extent(result.halves[0].positions, 1, 'min')).toBeCloseTo(-4, 4);
    // On the central splitting face the inner wall reaches x=15+2;
    // outer face reaches x=15+2+2 (no bbox scaling approximation).
    const xs: number[] = [];
    const p = result.halves[0].positions;
    for (let i = 0; i < p.length; i += 3) {
      if (Math.abs(p[i + 2]!) < 1e-5 && p[i + 1]! >= 0 && p[i + 1]! <= 40 && p[i]! > 15) xs.push(p[i]!);
    }
    expect(Math.min(...xs)).toBeCloseTo(17, 4);
    expect(Math.max(...xs)).toBeCloseTo(19, 4);
    expect(result.offsetErrorBoundMm).toBeLessThan(0.2);
  });

  it('B2: rounded box offset volume agrees with analytic dilation within tessellation tolerance', async () => {
    const result = await buildOffsetBarrier(await cube());
    const dilation = (r: number) => 2 * (30 * 40 + 30 * 50 + 40 * 50) * r + Math.PI * (30 + 40 + 50) * r * r + 4 / 3 * Math.PI * r ** 3;
    const expected = dilation(4) - dilation(2);
    const actual = result.halves.reduce((sum, p) => sum + p.meta!.volumeMm3!, 0);
    expect(Math.abs(actual - expected) / expected).toBeLessThan(0.01);
  });

  it('B3: handles the real nonconvex plaster master', async () => {
    const master = await buildSingleMold(revolve(referenceOuterProfile(8), { segments: 16, closeBottom: true, closeTop: true }));
    const result = await buildOffsetBarrier(master, { segments: 16 });
    for (const half of result.halves) expect(validateMesh(half).ok).toBe(true);
  }, 30000);

  it('B4: rejects invalid dimensions and insufficient offset resolution', async () => {
    const master = await cube();
    for (const opts of [{ clearanceMm: 0 }, { thicknessMm: NaN }, { segments: 15 }, { segments: 128 }]) {
      await expect(buildOffsetBarrier(master, opts)).rejects.toThrow('BARRIER_INVALID_OPTIONS');
    }
    await expect(buildOffsetBarrier(master, { thicknessMm: 100, segments: 16 })).rejects.toThrow('BARRIER_OFFSET_TOLERANCE');
  });
  it('B5: keyed mold parts retain closed exportable integrated jackets', async () => {
    const profile = referenceOuterProfile(8);
    const form = revolve(profile, { segments: 16, closeBottom: true, closeTop: true });
    const parts = await buildSplitMold(form, chooseSplitPlanes(profile), { profile });
    for (const part of parts) {
      const result = await buildOffsetBarrier(part, { segments: 16, casting: {} });
      for (const half of result.halves) expect(toBinaryStl(half).ok).toBe(true);
    }
  }, 60000);

  it('B6: integrated flange and three connected top ports produce valid STL halves', async () => {
    const master = await cube();
    const bare = await buildOffsetBarrier(master, { segments: 16 });
    const result = await buildOffsetBarrier(master, { segments: 16, casting: {} });
    expect(result.casting!.ports).toHaveLength(3);
    expect(result.casting!.fasteners.centers).toHaveLength(4);
    expect(result.casting!.fasteners.holeDia).toBe(4.5);
    expect(result.casting!.fasteners.axis).toBe('z');
    expect(result.casting!.fasteners.gripMm).toBe(4);
    expect(result.casting!.fasteners.edgeClearanceMm).toBeGreaterThanOrEqual(1);
    expect(result.casting!.ports.map((p) => p.diameter)).toEqual([12, 4, 4]);
    for (const port of result.casting!.ports) expect(port.removedVolumeMm3).toBeGreaterThan(1);
    for (const half of result.halves) expect(toBinaryStl(half).ok).toBe(true);
    expect(result.halves[0].meta!.volumeMm3!).toBeGreaterThan(bare.halves[0].meta!.volumeMm3!);
    await expect(buildOffsetBarrier(master, { segments: 16, casting: { flangeMm: -1 } })).rejects.toThrow('BARRIER_INVALID_CASTING');
    await expect(buildOffsetBarrier(master, { segments: 16, casting: { sprueDia: 500 } })).rejects.toThrow('BARRIER_TOP_PORTS_DO_NOT_FIT');
  });

  it('B7: fastener holes cross BOTH flanges at identical XY and reject unsafe edge clearance', async () => {
    const result = await buildOffsetBarrier(await cube(), { segments: 16, casting: {} });
    result.release = await analyzeMotherRelease(await cube(), result.halves);
    expect(result.release.halves).toHaveLength(2);
    expect(result.release.halves.every((half) => half.status === 'no-collision-at-samples')).toBe(true);
    const guide = motherAssemblyGuide(result);
    expect(guide).toContain('بدون تأیید پیوستهٔ جدایش');
    expect(guide).toContain('تضمین جدایش نیست');
    expect(guide).toContain('قطر سوراخ عبوری: 4.5');
    expect(guide).toContain('پیچ 4:');
    expect(guide).toContain('آب‌بندی خودکار یا شیار واشر');
    expect(guide).toContain('راستای +Y');
    const { centers, holeDia } = result.casting!.fasteners;
    // A hole center must not lie inside any flange triangle on the splitting face.
    const insideTriangle = (x: number, y: number, a: number[], b: number[], c: number[]) => {
      const cross = (p: number[], q: number[]) => (q[0]! - p[0]!) * (y - p[1]!) - (q[1]! - p[1]!) * (x - p[0]!);
      const signs = [cross(a, b), cross(b, c), cross(c, a)];
      return signs.every((n) => n > 1e-6) || signs.every((n) => n < -1e-6);
    };
    for (const half of result.halves) {
      const p = half.positions;
      let splitTriangles = 0;
      for (let i = 0; i < half.indices.length; i += 3) {
        const tri = [half.indices[i]!, half.indices[i + 1]!, half.indices[i + 2]!]
          .map((v) => [p[v * 3]!, p[v * 3 + 1]!, p[v * 3 + 2]!]);
        if (!tri.every((v) => Math.abs(v[2]!) < 1e-5)) continue;
        splitTriangles++;
        for (const [x, y] of centers) {
          expect(insideTriangle(x, y, tri[0]!, tri[1]!, tri[2]!)).toBe(false);
          expect(insideTriangle(x + holeDia / 4, y, tri[0]!, tri[1]!, tri[2]!)).toBe(false);
        }
      }
      expect(splitTriangles).toBeGreaterThan(0);
      expect(toBinaryStl(half).ok).toBe(true);
    }
    await expect(buildOffsetBarrier(await cube(), { casting: { flangeMm: 10 } }))
      .rejects.toThrow('BARRIER_FLANGE_TOO_NARROW_FOR_BOLTS');
    await expect(buildOffsetBarrier(await cube(), { casting: { boltHoleDia: NaN } }))
      .rejects.toThrow('BARRIER_INVALID_CASTING');
  });

});
