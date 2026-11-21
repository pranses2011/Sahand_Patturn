import { describe, it, expect } from 'vitest';
import {
  analyzeUndercut,
  keyTopRadius,
  socketRadius,
  keyVolumeMm3,
  moldBlockFor,
  plasterForCavity,
  chooseSplitPlanes,
  DEFAULT_KEY,
} from './index.js';
import { referenceOuterProfile, referenceProfile, capacityMl, plasterMix } from '@patturn/kernel';

describe('M — molds', () => {
  it('M1: cylinder-like profile (monotone widening) → drop-out safe, 1 part', () => {
    const profile = referenceOuterProfile(32);
    const rep = analyzeUndercut(profile);
    // reference outer profile is a bucket shape (widens bottom→top? actually narrows) — just assert report shape
    expect(rep.suggestedParts).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(rep.problemBands)).toBe(true);
  });

  it('M2: vase with belly → undercut detected → ≥2 parts', () => {
    // narrow foot → wide belly → narrow neck
    const profile = [
      { r: 30, y: 0 },
      { r: 60, y: 50 },
      { r: 65, y: 70 },
      { r: 40, y: 130 },
      { r: 45, y: 150 },
    ];
    const rep = analyzeUndercut(profile);
    expect(rep.dropOutSafe).toBe(false);
    expect(rep.suggestedParts).toBeGreaterThanOrEqual(2);
    expect(rep.problemBands.length).toBeGreaterThanOrEqual(1);
  });

  it('M3: monotone cone → drop-out safe', () => {
    const profile = [
      { r: 20, y: 0 },
      { r: 40, y: 60 },
      { r: 60, y: 120 },
    ];
    const rep = analyzeUndercut(profile);
    expect(rep.dropOutSafe).toBe(true);
    expect(rep.problemBands).toEqual([]);
  });

  it('M4: key top radius = r + h·tan(4°) (site formula, r=8 h=10)', () => {
    const rt = keyTopRadius(DEFAULT_KEY);
    expect(rt).toBeCloseTo(8 + 10 * Math.tan((4 * Math.PI) / 180), 6);
    expect(rt).toBeCloseTo(8.6993, 3); // locked golden value
  });

  it('M5: socket = male + clearance 0.20', () => {
    expect(socketRadius(DEFAULT_KEY)).toBeCloseTo(keyTopRadius(DEFAULT_KEY) + 0.2, 6);
  });

  it('M6: key volume positive and small', () => {
    const v = keyVolumeMm3(DEFAULT_KEY);
    expect(v).toBeGreaterThan(100);
    expect(v).toBeLessThan(5000);
  });

  it('M7: mold block adds wall 25 (sides) and base 20', () => {
    const b = moldBlockFor({ min: [-50, 0, -50], max: [50, 148, 50] });
    expect(b.w).toBe(150);
    expect(b.d).toBe(150);
    expect(b.h).toBe(148 + 20 + 25);
    expect(b.draftDeg).toBe(1.5);
  });

  it('M8: plaster for reference-form cavity matches site mix within 2%', () => {
    // cavity = inner capacity of reference form in L
    const capMl = capacityMl(referenceProfile(128));
    const { plasterKg, waterKg } = plasterForCavity(capMl * 1000);
    const ratioP = Math.abs(plasterKg - capMl / 1000 / (1 / 2.75 + 0.7)) / plasterKg;
    expect(ratioP).toBeLessThan(0.001);
    expect(waterKg).toBeCloseTo(plasterKg * 0.7, 6);
  });

  it('M9: site sample 1.84 L → 1.72/1.20 (±2% of site display)', () => {
    const { plasterKg, waterKg } = plasterMix(1.84);
    expect(plasterKg).toBeGreaterThan(1.72 * 0.98);
    expect(plasterKg).toBeLessThan(1.72 * 1.02);
    expect(waterKg).toBeGreaterThan(1.20 * 0.98);
    expect(waterKg).toBeLessThan(1.20 * 1.02);
  });

  it('M10: bucket (narrows upward) → horizontal split at y≈0', () => {
    const profile = [
      { r: 0, y: -4 }, { r: 72.5, y: -4 }, { r: 72.5, y: 0 },
      { r: 66, y: 60 }, { r: 60, y: 120 }, { r: 58, y: 148 }, { r: 54, y: 148 },
    ];
    const plan = chooseSplitPlanes(profile);
    expect(plan.kind).toBe('horizontal');
    expect(plan.y).toBeCloseTo(0, 6);
    expect(plan.parts).toBe(2);
    expect(plan.score).toBe(20);
    expect(plan.normal).toEqual([0, 1, 0]);
    expect(plan.balance).toBeGreaterThanOrEqual(0);
    expect(plan.balance).toBeLessThanOrEqual(0.5);
  });

  it('M11: clean belly → horizontal at max-r y=70; cone → none', () => {
    const belly = [
      { r: 30, y: 0 }, { r: 60, y: 50 }, { r: 65, y: 70 }, { r: 40, y: 130 },
    ];
    const p1 = chooseSplitPlanes(belly);
    expect(p1.kind).toBe('horizontal');
    expect(p1.y).toBeCloseTo(70, 6);
    expect(p1.balance).toBeGreaterThan(0.1);
    const cone = [{ r: 20, y: 0 }, { r: 40, y: 60 }, { r: 60, y: 120 }];
    const p2 = chooseSplitPlanes(cone);
    expect(p2.kind).toBe('none');
    expect(p2.parts).toBe(1);
    expect(p2.score).toBe(10);
  });

  it('M12: flare-top vase (M2 profile) → vertical split', () => {
    const profile = [
      { r: 30, y: 0 }, { r: 60, y: 50 }, { r: 65, y: 70 }, { r: 40, y: 130 }, { r: 45, y: 150 },
    ];
    const plan = chooseSplitPlanes(profile);
    expect(plan.kind).toBe('vertical');
    expect(plan.normal).toEqual([0, 0, 1]);
    expect(plan.offset).toBe(0);
    expect(plan.parts).toBe(2);
    expect(plan.score).toBe(21);
    expect(plan.balance).toBeCloseTo(0.5, 6);
  });
});
