import { describe, it, expect } from 'vitest';
import DxfParser from 'dxf-parser';
import { traceImage } from '@patturn/patterns';
import { toSvg, toDxf } from './index.js';
describe('Traced contour exports', () => {
  it.each([0, 0.2])('exports closed mm paths with RDP tolerance %s', (toleranceMm) => {
    const pixels = new Uint8Array(64).fill(255);
    for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) pixels[y * 8 + x] = 0;
    const drawing = traceImage({ width: 8, height: 8, pixels, referenceWidthMm: 80, toleranceMm });
    const svg = toSvg(drawing.paths, drawing.width, drawing.height, { strokeMm: 0.2 });
    expect(svg.ok).toBe(true);
    expect(new TextDecoder().decode(svg.bytes)).toContain('width="80mm"');
    const dxf = toDxf(drawing.paths, { width: drawing.width, height: drawing.height });
    expect(dxf.ok).toBe(true);
    const doc = new DxfParser().parseSync(new TextDecoder().decode(dxf.bytes))!;
    expect(doc.header['$MEASUREMENT']).toBe(1);
    expect(doc.entities.length).toBeGreaterThanOrEqual(4);
    expect(doc.entities.every((entity) => entity.type === 'LINE')).toBe(true);
  });
});
