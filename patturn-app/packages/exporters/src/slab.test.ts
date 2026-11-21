import { describe, expect, it } from 'vitest';
import DxfParser from 'dxf-parser';
import { buildSlab } from '@patturn/patterns';
import { toSvg, toDxf } from './index.js';
describe('Developed slab vector exports', () => {
  it.each([
    [40, 40],
    [40, 60],
    [60, 40],
  ])('exports mm boundary and guides for %j', (bottomRadius, topRadius) => {
    const drawing = buildSlab({
      bottomRadius: bottomRadius!,
      topRadius: topRadius!,
      height: 100,
      guides: 8,
    });
    const svg = toSvg(drawing.paths, drawing.width, drawing.height, { strokeMm: 0.2 });
    expect(svg.ok).toBe(true);
    expect(new TextDecoder().decode(svg.bytes)).toContain(`width="${drawing.width}mm"`);
    const dxf = toDxf(drawing.paths, { width: drawing.width, height: drawing.height });
    expect(dxf.ok).toBe(true);
    const doc = new DxfParser().parseSync(new TextDecoder().decode(dxf.bytes))!;
    expect(doc.header['$MEASUREMENT']).toBe(1);
    expect(doc.entities.length).toBeGreaterThanOrEqual(11);
    expect(doc.entities.every((entity) => entity.type === 'LINE')).toBe(true);
  });
});
