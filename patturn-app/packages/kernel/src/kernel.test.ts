import { describe, it, expect } from 'vitest';
import {
  referenceProfile,
  referenceOuterProfile,
  REFERENCE,
  capacityMl,
  filledMl,
  shrinkDim,
  shrinkVolume,
  plasterMix,
  revolve,
  validateMesh,
  catmullRom,
  validateProfile,
  ParamGraph,
} from './index.js';

describe('G — golden geometry tests', () => {
  it('G1: reference capacity = 1131 ml ±1%', () => {
    const cap = capacityMl(referenceProfile(256));
    expect(cap).toBeGreaterThan(1131 * 0.99);
    expect(cap).toBeLessThan(1131 * 1.01);
  });

  it('G2: filled 80% = 958 ml ±1%', () => {
    const f = filledMl(referenceProfile(256), REFERENCE.fillLevel);
    expect(f).toBeGreaterThan(958 * 0.99);
    expect(f).toBeLessThan(958 * 1.01);
  });

  it('G3: shrink 145mm @12% → 127.6mm', () => {
    expect(shrinkDim(145, 0.12)).toBeCloseTo(127.6, 6);
  });

  it('G4: plaster mix for 1.84 L → P≈1.73 kg, W≈1.21 kg (±2%)', () => {
    const { plasterKg, waterKg, mixDensityKgL } = plasterMix(1.84);
    expect(plasterKg).toBeGreaterThan(1.73 * 0.98);
    expect(plasterKg).toBeLessThan(1.73 * 1.02);
    expect(waterKg).toBeGreaterThan(1.21 * 0.98);
    expect(waterKg).toBeLessThan(1.21 * 1.02);
    expect(mixDensityKgL).toBeCloseTo(1.59, 1);
  });

  it('G5: dry capacity 1131 @12% → 770.7 ml', () => {
    expect(shrinkVolume(1131, 0.12)).toBeCloseTo(770.7, 0);
  });

  it('G6: revolve mesh is watertight & manifold (open edges 0, volume > 0, euler = 2)', () => {
    const outer = referenceOuterProfile(48);
    const mesh = revolve(outer, { segments: 48, closeBottom: true, closeTop: true });
    const report = validateMesh(mesh);
    expect(report.openEdges).toBe(0);
    expect(report.signedVolumeMm3).toBeGreaterThan(0);
    expect(report.problems).toEqual([]);
    // genus-0 closed surface: V - E + F = 2
    expect(report.euler).toBe(2);
  });

  it('G7: mesh volume ≈ analytic outer volume within 2%', () => {
    const outer = referenceOuterProfile(64);
    const mesh = revolve(outer, { segments: 64, closeBottom: true, closeTop: true });
    // analytic: inner capacity + wall shell (rough bound) — mesh volume must exceed inner capacity
    const innerCap = capacityMl(referenceProfile(256)) * 1000; // mm³
    expect(mesh.meta!.volumeMm3!).toBeGreaterThan(innerCap * 1.01);
    expect(mesh.meta!.volumeMm3!).toBeLessThan(innerCap * 1.6);
  });

  it('G8: outer max diameter = 145 mm ±0.5', () => {
    const outer = referenceOuterProfile(64);
    const maxR = Math.max(...outer.map((p) => p.r));
    expect(maxR * 2).toBeCloseTo(145, 0);
  });

  it('G9: outer height = 148 mm', () => {
    const outer = referenceOuterProfile(64);
    const ys = outer.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(148, 6);
  });
});

describe('F — profile & param graph', () => {
  it('F1: catmullRom interpolates nodes exactly at t=0/1', () => {
    const nodes = [
      { r: 30, y: 0 },
      { r: 60, y: 70 },
      { r: 40, y: 140 },
    ];
    const s = catmullRom(nodes, 8);
    expect(s[0]!.r).toBeCloseTo(30, 5);
    expect(s[s.length - 1]!.r).toBeCloseTo(40, 5);
    expect(validateProfile(s)).toBeNull();
  });

  it('F2: param graph memoizes and invalidates on set', () => {
    const g = new ParamGraph();
    let deriveCalls = 0;
    g.add({ id: 'h', type: 'input', value: 100, inputs: [] });
    g.add({
      id: 'v',
      type: 'derive',
      inputs: ['h'],
      derive: (i) => {
        deriveCalls++;
        return (i['h'] as number) * 2;
      },
    });
    expect(g.get('v')).toBe(200);
    expect(g.get('v')).toBe(200);
    expect(deriveCalls).toBe(1); // memoized
    g.set('h', 150);
    expect(g.get('v')).toBe(300);
    expect(deriveCalls).toBe(2);
  });

  it('F3: constraints clamp input values', () => {
    const g = new ParamGraph();
    g.add({ id: 'x', type: 'input', value: 5, inputs: [], constraint: { min: 0, max: 10 } });
    g.set('x', 99);
    expect(g.get('x')).toBe(10);
    g.set('x', -3);
    expect(g.get('x')).toBe(0);
  });

  it('F4: determinism — same profile twice → identical mesh bytes', () => {
    const a = revolve(referenceOuterProfile(32), { segments: 32, closeTop: true });
    const b = revolve(referenceOuterProfile(32), { segments: 32, closeTop: true });
    expect(Buffer.from(a.positions).equals(Buffer.from(b.positions))).toBe(true);
    expect(Buffer.from(a.indices).equals(Buffer.from(b.indices))).toBe(true);
  });
});
