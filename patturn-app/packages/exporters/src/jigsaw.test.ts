import { describe, expect, it } from 'vitest';
import DxfParser from 'dxf-parser';
import { buildJigsaw } from '@patturn/patterns';
import { toSvg, toDxf } from './index.js';
describe('Jigsaw vector exports', () => {
  it.each([2, 3, 6])(
    'exports %s square cells per side to SVG and independently readable DXF',
    (count) => {
      const drawing = buildJigsaw({ rows: count, columns: count, cellMm: 40, tabMm: 3, seed: 42 });
      const svg = toSvg(drawing.paths, drawing.width, drawing.height, { strokeMm: 0.2 });
      expect(svg.ok).toBe(true);
      expect(new TextDecoder().decode(svg.bytes)).toContain(`width="${drawing.width}mm"`);
      const dxf = toDxf(
        drawing.paths,
        { width: drawing.width, height: drawing.height },
        { bezierToleranceMm: 0.05 },
      );
      expect(dxf.ok).toBe(true);
      const doc = new DxfParser().parseSync(new TextDecoder().decode(dxf.bytes))!;
      expect(doc.header['$ACADVER']).toBe('AC1009');
      expect(doc.header['$MEASUREMENT']).toBe(1);
      expect(doc.entities.length).toBeGreaterThan(drawing.paths.length);
      expect(doc.entities.every((entity) => entity.type === 'LINE')).toBe(true);
    },
  );
});
