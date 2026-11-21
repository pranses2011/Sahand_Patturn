import { describe, it, expect } from 'vitest';
import { dimensionSheetLayout, clipProfileLine, toDimensionPdf, SHEET } from './index.js';
import { referenceOuterProfile } from '@patturn/kernel';

describe('Dimension PDF', () => {
  it('D1: A4 reference profile fits one unscaled tile, plus summary', async () => {
    const profile = referenceOuterProfile(16);
    const layout = dimensionSheetLayout(profile);
    expect(layout.diameterMm).toBeCloseTo(145);
    expect(layout.heightMm).toBeCloseTo(148);
    expect(layout.tiles).toHaveLength(1);
    const out = await toDimensionPdf(profile, { project: 'گلدان' });
    expect(out.ok, out.error).toBe(true);
    const pdf = new TextDecoder('latin1').decode(out.bytes!);
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(2);
    expect(pdf).toContain('/MediaBox [0 0 595.28 841.89]');
    expect(pdf).toContain('/FontFile2'); // embedded offline Persian font
    const segments = [...pdf.matchAll(/([\d.]+) ([\d.]+) m\n([\d.]+) ([\d.]+) l/g)];
    const ruler = segments.find((m) => Math.abs(Number(m[1]) - 15 * 72 / 25.4) < 0.001 && Math.abs(Number(m[3]) - 115 * 72 / 25.4) < 0.001);
    expect(ruler).toBeDefined();
    expect((Number(ruler![3]) - Number(ruler![1])) * 25.4 / 72).toBeCloseTo(100, 4);
  });
  it('D2: large profiles tile, never scale down', () => {
    const layout = dimensionSheetLayout([{ r: 200, y: -5 }, { r: 200, y: 495 }]);
    expect(layout.tiles).toHaveLength(9);
    expect(layout.tiles[0]!.xMin).toBe(-200);
    expect(layout.tiles[1]!.xMin).toBe(-20);
    expect(layout.tiles[3]!.yMax).toBe(265);
    for (const tile of layout.tiles) {
      expect(tile.xMax - tile.xMin).toBe(SHEET.tileWidthMm);
      expect(tile.yMax - tile.yMin).toBe(SHEET.tileHeightMm);
    }
  });
  it('D3: clips crossing lines without changing metric length or losing crossings', () => {
    const tile = { column: 0, row: 0, xMin: 0, xMax: 180, yMin: 0, yMax: 230 };
    expect(clipProfileLine([-10, 20], [200, 20], tile)).toEqual([0, 20, 180, 20]);
    expect(clipProfileLine([20, -5], [20, 240], tile)).toEqual([20, 0, 20, 230]);
    expect(clipProfileLine([-10, -10], [-5, -5], tile)).toBeNull();
  });
  it('D4: invalid or excessive profiles fail without partial PDF', async () => {
    for (const profile of [[], [{ r: NaN, y: 0 }, { r: 2, y: 10 }], [{ r: 1, y: 10 }, { r: 2, y: 0 }], [{ r: 1e6, y: 0 }, { r: 1e6, y: 1e6 }]]) {
      const out = await toDimensionPdf(profile);
      expect(out.ok).toBe(false); expect(out.bytes).toBeUndefined();
    }
  });
  it('D5: reproducible bytes with Persian labels', async () => {
    const p = referenceOuterProfile(8);
    expect((await toDimensionPdf(p)).bytes).toEqual((await toDimensionPdf(p)).bytes);
  });
});
