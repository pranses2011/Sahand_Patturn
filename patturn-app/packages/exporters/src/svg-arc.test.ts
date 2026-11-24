import { describe, it, expect } from 'vitest';
import { flattenSvgArc } from './svg-arc.js';
import { segmentDistance, type Point2 } from './bezier.js';
import { toDxf } from './index.js';
import DxfParser from 'dxf-parser';
describe('Tolerance-bounded rotated elliptical arcs', () => {
  it.each([0, 30, 90, 173])(
    'bounds sampled error for a rotated half ellipse at %s degrees',
    (rotation) => {
      const phi = (rotation * Math.PI) / 180;
      const point = (theta: number): Point2 => [
        100 + 40 * Math.cos(theta) * Math.cos(phi) - 10 * Math.sin(theta) * Math.sin(phi),
        100 + 40 * Math.cos(theta) * Math.sin(phi) + 10 * Math.sin(theta) * Math.cos(phi),
      ];
      const start = point(0),
        end = point(Math.PI),
        arc = { rx: 40, ry: 10, rotation, large: 0, sweep: 1, end };
      const line = flattenSvgArc(start, arc, 0.05);
      expect(line[0]).toEqual(start);
      expect(line.at(-1)).toEqual(end);
      for (let i = 0; i <= 500; i++)
        expect(
          Math.min(
            ...line
              .slice(1)
              .map((p, j) => segmentDistance(point((Math.PI * i) / 500), line[j]!, p)),
          ),
        ).toBeLessThanOrEqual(0.05 + 1e-5);
      expect(flattenSvgArc(start, arc, 0.01).length).toBeGreaterThan(line.length);
      expect(flattenSvgArc(start, arc, 0.05)).toEqual(line);
    },
  );
  it.each([
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ])('handles large/sweep flags %j deterministically', (large, sweep) => {
    const line = flattenSvgArc(
      [40, 0],
      { rx: 40, ry: 20, rotation: 0, large: large!, sweep: sweep!, end: [0, 20] },
      0.05,
    );
    expect(line.length).toBeGreaterThan(2);
    expect(line[0]).toEqual([40, 0]);
    expect(line.at(-1)).toEqual([0, 20]);
    if (large) expect(line.length).toBeGreaterThan(30);
    else expect(line.length).toBeLessThan(30);
  });
  it('corrects undersized radii and follows SVG zero-radius and coincident-endpoint rules', () => {
    const corrected = flattenSvgArc(
      [0, 0],
      { rx: 2, ry: 1, rotation: 0, large: 0, sweep: 1, end: [40, 0] },
      0.05,
    );
    expect(corrected.at(-1)).toEqual([40, 0]);
    expect(corrected.length).toBeGreaterThan(2);
    expect(
      flattenSvgArc([0, 0], { rx: 0, ry: 2, rotation: 0, large: 0, sweep: 1, end: [40, 0] }, 0.05),
    ).toEqual([
      [0, 0],
      [40, 0],
    ]);
    expect(
      flattenSvgArc([0, 0], { rx: 2, ry: 2, rotation: 0, large: 0, sweep: 1, end: [0, 0] }, 0.05),
    ).toEqual([[0, 0]]);
  });
  it.each([{ large: 2 }, { sweep: 0.5 }, { rx: Infinity }, { rotation: NaN }])(
    'rejects invalid arc data %j',
    (override) => {
      expect(() =>
        flattenSvgArc(
          [0, 0],
          { rx: 20, ry: 10, rotation: 0, large: 0, sweep: 1, end: [40, 0], ...override },
          0.05,
        ),
      ).toThrow();
    },
  );
  it('enforces tolerance, corrected radius and segment budgets', () => {
    const arc = { rx: 40, ry: 10, rotation: 0, large: 0, sweep: 1, end: [0, 20] as Point2 };
    expect(() => flattenSvgArc([40, 0], arc, 0)).toThrow();
    expect(() => flattenSvgArc([40, 0], { ...arc, rx: 1e7, ry: 1, large: 1 }, 0.001)).toThrow();
  });
  it('exports relative and repeated elliptical arcs and resets smooth control after an arc', () => {
    const options = { bezierToleranceMm: 0.05 };
    const a = toDxf(
      [{ d: 'M50 50 a20 10 30 0 1 30 0 20 10 0 0 0 30 0 T130 50' }],
      { width: 160, height: 100 },
      options,
    );
    const b = toDxf(
      [{ d: 'M50 50 A20 10 30 0 1 80 50 A20 10 0 0 0 110 50 Q110 50 130 50' }],
      { width: 160, height: 100 },
      options,
    );
    expect(a.ok, a.error).toBe(true);
    expect(a.bytes).toEqual(b.bytes);
    const doc = new DxfParser().parseSync(new TextDecoder().decode(a.bytes))!;
    expect(doc.entities.every((item) => item.type === 'LINE')).toBe(true);
  });
  it('clips mixed ellipse paths, rejects malformed flags atomically and requires explicit tolerance', () => {
    const output = toDxf(
      [{ d: 'M0 10 A40 20 30 1 1 80 10 L90 10' }],
      { width: 60, height: 30 },
      { bezierToleranceMm: 0.05 },
    );
    expect(output.ok, output.error).toBe(true);
    const doc = new DxfParser().parseSync(new TextDecoder().decode(output.bytes))!;
    for (const item of doc.entities as unknown as { vertices: { x: number; y: number }[] }[])
      for (const p of item.vertices) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-7);
        expect(p.x).toBeLessThanOrEqual(60 + 1e-7);
        expect(p.y).toBeGreaterThanOrEqual(-1e-7);
        expect(p.y).toBeLessThanOrEqual(30 + 1e-7);
      }
    for (const d of ['M0 0 A20 10 0 2 0 40 0', 'M0 0 A20 10 0 0 1 40']) {
      const out = toDxf([{ d: 'M0 0L1 1' }, { d }], undefined, { bezierToleranceMm: 0.05 });
      expect(out.ok).toBe(false);
      expect(out.bytes).toBeUndefined();
    }
    expect(toDxf([{ d: 'M0 0 A20 10 30 0 1 40 0' }]).ok).toBe(false);
  });
});
