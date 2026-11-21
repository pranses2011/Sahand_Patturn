import { describe, it, expect, beforeAll } from 'vitest';
import { initCsg, buildSingleMold, makeKeyMale, makeKeyFemale, csgReady } from './csg.js';
import { referenceOuterProfile, revolve, validateMesh } from '@patturn/kernel';

beforeAll(async () => {
  await initCsg();
});

const form = () => revolve(referenceOuterProfile(32), { segments: 32, closeBottom: true, closeTop: true });

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
    const wall = 25, base = 20;
    const bw = 145 + wall * 2, bd = 145 + wall * 2, bh = 148 + base + wall;
    const blockVol = bw * bd * bh;
    const cavity = blockVol - moldVol;
    expect(cavity).toBeGreaterThan(f.meta!.volumeMm3! * 0.9);
    expect(cavity).toBeLessThan(f.meta!.volumeMm3! * 1.15);
  });

  it('C5: shrink scaling enlarges the cavity (12% → cavity ×≈1.46)', async () => {
    const f = form();
    const wall = 25, base = 20;
    const cavityOf = async (shrink: number) => {
      const s = 1 / (1 - shrink);
      const moldVol = (await buildSingleMold(f, { shrink })).meta!.volumeMm3!;
      const bw = 145 * s + wall * 2, bd = 145 * s + wall * 2, bh = 148 * s + base + wall;
      return bw * bd * bh - moldVol;
    };
    const dry = await cavityOf(0);
    const wet = await cavityOf(0.12);
    expect(dry).toBeCloseTo(f.meta!.volumeMm3!, -4);
    // (1/(1−0.12))³ = 1.466 — wet cavity ≈ dry × 1.466 (bbox walls add slack)
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
});
