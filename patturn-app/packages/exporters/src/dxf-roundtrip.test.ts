import { describe, expect, it } from 'vitest';
import DxfParser from 'dxf-parser';
import { PATTERNS } from '@patturn/patterns';
import { toDxf } from './index.js';
import type { IArcEntity } from 'dxf-parser/dist/entities/arc.js';
import type { ICircleEntity } from 'dxf-parser/dist/entities/circle.js';
import type { ILineEntity } from 'dxf-parser/dist/entities/line.js';
import type { IPolylineEntity } from 'dxf-parser/dist/entities/polyline.js';

function read(paths: { d: string; fill?: boolean }[], clip = true) {
  const exported = toDxf(paths, clip ? { width: 80, height: 80 } : undefined, {
    bezierToleranceMm: 0.05,
  });
  expect(exported.ok).toBe(true);
  const doc = new DxfParser().parseSync(new TextDecoder().decode(exported.bytes));
  expect(doc).not.toBeNull();
  return doc!;
}
function inside(x: number, y: number) {
  expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
  expect(x).toBeGreaterThanOrEqual(-1e-7);
  expect(x).toBeLessThanOrEqual(80 + 1e-7);
  expect(y).toBeGreaterThanOrEqual(-1e-7);
  expect(y).toBeLessThanOrEqual(80 + 1e-7);
}

describe('Independent DXF reader round-trip (not a CAD runtime test)', () => {
  it.each(PATTERNS)(
    '$id parses into supported finite, bounded entities and declared layers',
    (pattern) => {
      const paths = pattern.build({
        canvasW: 80,
        canvasH: 80,
        tileW: 40,
        tileH: 40,
        seed: 42,
        params: { ...pattern.defaults },
      });
      const doc = read(paths);
      expect(doc.header['$ACADVER']).toBe('AC1009');
      expect(doc.header['$MEASUREMENT']).toBe(1);
      expect(Object.keys(doc.tables.layer.layers).sort()).toEqual(['detail', 'outline']);
      expect(doc.entities.length).toBeGreaterThan(0);
      for (const entity of doc.entities) {
        expect(['outline', 'detail']).toContain(entity.layer);
        expect(['LINE', 'ARC', 'CIRCLE']).toContain(entity.type);
        if (entity.type === 'LINE') {
          const line = entity as ILineEntity;
          expect(line.vertices).toHaveLength(2);
          for (const p of line.vertices) inside(p.x, p.y);
        } else {
          const arc = entity as IArcEntity | ICircleEntity;
          expect(arc.radius).toBeGreaterThan(0);
          expect(Number.isFinite(arc.radius)).toBe(true);
          const start = entity.type === 'ARC' ? arc.startAngle : 0;
          let end = entity.type === 'ARC' ? arc.endAngle : 2 * Math.PI;
          if (end <= start) end += 2 * Math.PI;
          // Independent-reader angles are radians. Sample the decoded geometry, not source strings.
          for (let i = 0; i <= 32; i++) {
            const t = start + ((end - start) * i) / 32;
            inside(
              arc.center.x + arc.radius * Math.cos(t),
              arc.center.y + arc.radius * Math.sin(t),
            );
          }
        }
      }
    },
  );
  it('recovers circle center/radius and closed polyline flag without clipping', () => {
    const doc = read(
      [
        { d: 'M7.5 20a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0z', fill: true },
        { d: 'M1 2L11 2L11 12L1 12z' },
      ],
      false,
    );
    expect(doc.entities).toHaveLength(2);
    const circle = doc.entities[0] as ICircleEntity;
    expect(circle.type).toBe('CIRCLE');
    expect(circle.center).toMatchObject({ x: 10, y: 20 });
    expect(circle.radius).toBe(2.5);
    const poly = doc.entities[1] as IPolylineEntity;
    expect(poly.shape).toBe(true);
    expect(poly.vertices).toHaveLength(4);
    expect(poly.vertices[0]).toMatchObject({ x: 1, y: 2 });
  });
});
