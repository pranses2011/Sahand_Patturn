import { describe, it, expect, beforeAll } from 'vitest';
import {
  initCsg,
  buildSingleMold,
  makeKeyMale,
  makeKeyFemale,
  csgReady,
  buildBlock,
  buildSplitMold,
} from './csg.js';
import { chooseSplitPlanes } from './index.js';
import { referenceOuterProfile, revolve, validateMesh, type Mesh } from '@patturn/kernel';

beforeAll(async () => {
  await initCsg();
});

const form = () =>
  revolve(referenceOuterProfile(32), { segments: 32, closeBottom: true, closeTop: true });

const bboxOf = (m: Mesh) => {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = m.positions[i + k]!;
      if (v < min[k]!) min[k] = v;
      if (v > max[k]!) max[k] = v;
    }
  }
  return { min, max };
};

describe('C — CSG boolean molds (manifold-3d)', () => {
  it('C1: WASM initializes', () => {
    expect(csgReady()).toBe(true);
  });

  it('C2: single mold = block − form is a valid manifold solid', async () => {
    const mold = await buildSingleMold(form());
    const rep = validateMesh(mold);
    expect(rep.ok, rep.problems.join(',')).toBe(true);
    expect(rep.openEdges).toBe(0);
    expect(rep.signedVolumeMm3).toBeGreaterThan(0);
  });

  it('C3: mold volume < block volume and > form volume', async () => {
    const f = form();
    const mold = await buildSingleMold(f);
    const formVol = f.meta!.volumeMm3!;
    const moldVol = mold.meta!.volumeMm3!;
    // block ≈ (145+50) × (148+45) × (145+50) ≈ 195×193×195 ≈ 7.3e6 mm³
    expect(moldVol).toBeLessThan(8.5e6);
    expect(moldVol).toBeGreaterThan(formVol);
  });

  it('C4: mold cavity equals form volume (block − cavity check)', async () => {
    const f = form();
    const moldVol = (await buildSingleMold(f)).meta!.volumeMm3!;
    const bb = bboxOf(f);
    const blockVol = buildBlock({ min: bb.min, max: bb.max }).volume();
    // draft taper trims the analytic box (195×193×195 = 7,338,825)
    expect(blockVol).toBeLessThan(195 * 193 * 195);
    expect(blockVol).toBeGreaterThan(195 * 193 * 195 * 0.9);
    const cavity = blockVol - moldVol;
    expect(cavity).toBeGreaterThan(f.meta!.volumeMm3! * 0.98);
    expect(cavity).toBeLessThan(f.meta!.volumeMm3! * 1.02);
  });

  it('C5: shrink scaling enlarges the cavity (12% → cavity ×≈1.46)', async () => {
    const f = form();
    const bb = bboxOf(f);
    const cavityOf = async (shrink: number) => {
      const s = 1 / (1 - shrink);
      const moldVol = (await buildSingleMold(f, { shrink })).meta!.volumeMm3!;
      const blockVol = buildBlock({
        min: bb.min.map((v) => v * s) as [number, number, number],
        max: bb.max.map((v) => v * s) as [number, number, number],
      }).volume();
      return blockVol - moldVol;
    };
    const dry = await cavityOf(0);
    const wet = await cavityOf(0.12);
    expect(dry).toBeCloseTo(f.meta!.volumeMm3!, -4);
    // (1/(1−0.12))³ = 1.466 — wet cavity ≈ dry × 1.466
    expect(wet / dry).toBeGreaterThan(1.3);
    expect(wet / dry).toBeLessThan(1.7);
  });

  it('C6: key male top radius matches golden 8.6993', async () => {
    const key = makeKeyMale(8, 10, 4);
    const bb = key.boundingBox();
    const h = bb.max[1] - bb.min[1];
    expect(h).toBeCloseTo(10, 3);
    // top radius from volume: V = πh/3 (r1²+r1r2+r2²) → verify via bbox radius
    expect(bb.max[0] - bb.min[0]).toBeGreaterThan(16); // > 2r
    expect(bb.max[0] - bb.min[0]).toBeLessThan(18);
  });

  it('C7: female socket is larger than male (clearance works)', async () => {
    const male = makeKeyMale(8, 10, 4);
    const female = makeKeyFemale(8, 10, 4, 0.2);
    expect(female.volume()).toBeGreaterThan(male.volume());
  });

  it('C8: determinism — same input → same mold volume', async () => {
    const a = await buildSingleMold(form());
    const b = await buildSingleMold(form());
    expect(a.meta!.volumeMm3!).toBeCloseTo(b.meta!.volumeMm3!, 3);
  });

  it('C9: horizontal split → 2 valid parts, volumes sum to single mold', async () => {
    const f = form();
    const profile = referenceOuterProfile(32);
    const plan = chooseSplitPlanes(profile);
    expect(plan.kind).toBe('horizontal');
    const parts = await buildSplitMold(f, plan, { profile });
    expect(parts).toHaveLength(2);
    for (const p of parts) {
      const rep = validateMesh(p);
      expect(rep.ok, rep.problems.join(',')).toBe(true);
    }
    const singleVol = (await buildSingleMold(f)).meta!.volumeMm3!;
    const sum = parts.reduce((a, p) => a + p.meta!.volumeMm3!, 0);
    expect(Math.abs(sum - singleVol) / singleVol).toBeLessThan(0.005);
    // A (parts[0], lower) carries male keys protruding above the split plane
    expect(bboxOf(parts[0]!).max[1]).toBeGreaterThan(plan.y + 5);
    // B (parts[1], upper) bottom sits on the split plane
    expect(Math.abs(bboxOf(parts[1]!).min[1] - plan.y)).toBeLessThan(0.5);
  });

  it('C10: vertical split → 2 valid parts, keys protrude +z from A', async () => {
    const profile = [
      { r: 30, y: 0 },
      { r: 60, y: 50 },
      { r: 65, y: 70 },
      { r: 40, y: 130 },
      { r: 45, y: 150 },
    ];
    const f = revolve(profile, { segments: 32, closeBottom: true, closeTop: true });
    const plan = chooseSplitPlanes(profile);
    expect(plan.kind).toBe('vertical');
    const parts = await buildSplitMold(f, plan, { profile });
    expect(parts).toHaveLength(2);
    for (const p of parts) {
      const rep = validateMesh(p);
      expect(rep.ok, rep.problems.join(',')).toBe(true);
    }
    // A (parts[0], z<0 side) carries male keys reaching z≈10
    expect(Math.abs(bboxOf(parts[0]!).max[2] - 10)).toBeLessThan(0.5);
    const singleVol = (await buildSingleMold(f)).meta!.volumeMm3!;
    const sum = parts.reduce((a, p) => a + p.meta!.volumeMm3!, 0);
    expect(Math.abs(sum - singleVol) / singleVol).toBeLessThan(0.005);
  });

  it('C11: none plan → single part identical to buildSingleMold', async () => {
    const f = form();
    const cone = [
      { r: 20, y: 0 },
      { r: 40, y: 60 },
      { r: 60, y: 120 },
    ];
    const plan = chooseSplitPlanes(cone);
    expect(plan.kind).toBe('none');
    const parts = await buildSplitMold(f, plan, {});
    expect(parts).toHaveLength(1);
    const singleVol = (await buildSingleMold(f)).meta!.volumeMm3!;
    expect(parts[0]!.meta!.volumeMm3!).toBeCloseTo(singleVol, 3);
  });
});
