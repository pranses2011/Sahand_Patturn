import { describe, it, expect } from 'vitest';
import { dimensionSheetLayout, clipProfileLine, toDimensionPdf, SHEET, MAX_PDF_PROFILE_POINTS, MAX_PDF_COORDINATE_MM } from './index.js';
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
  it('D6: an already-cancelled request returns no PDF bytes',async()=>{
    const controller=new AbortController();controller.abort();
    const result=await toDimensionPdf(referenceOuterProfile(8),{signal:controller.signal});
    expect(result.ok).toBe(false);expect(result.error).toContain('EXPORT_CANCELLED');expect(result.bytes).toBeUndefined();
  });
  it('D7: cancellation delivered while yielding pages discards the partial document',async()=>{
    const controller=new AbortController();
    const pending=toDimensionPdf(referenceOuterProfile(8),{signal:controller.signal});
    const timer=setTimeout(()=>controller.abort(),0);
    const result=await pending;clearTimeout(timer);
    expect(result.ok).toBe(false);expect(result.error).toContain('EXPORT_CANCELLED');expect(result.bytes).toBeUndefined();
  });
  it('D8: adding a live signal does not alter deterministic output bytes',async()=>{
    const profile=referenceOuterProfile(8);
    expect((await toDimensionPdf(profile,{signal:new AbortController().signal})).bytes)
      .toEqual((await toDimensionPdf(profile)).bytes);
  });

  it('D9: captures profile and parameter rows before yielding to asynchronous work',async()=>{
    const profile=referenceOuterProfile(8);
    const original=profile.map((point)=>({...point}));
    const parameters=[{label:'ضخامت',value:'4 mm'}];
    const options={project:'original',parameters,signal:new AbortController().signal};
    const pending=toDimensionPdf(profile,options);
    profile[1]!.r=999;profile.push({r:1000,y:1000});
    parameters[0]!.value='999 mm';parameters.push({label:'extra',value:'changed'});
    options.project='changed';
    const result=await pending;
    const expected=await toDimensionPdf(original,{project:'original',parameters:[{label:'ضخامت',value:'4 mm'}]});
    expect(result.ok).toBe(true);expect(result.filename).toBe(expected.filename);expect(result.bytes).toEqual(expected.bytes);
  });

  it('D10: enforces point budget before reading or copying point payloads',async()=>{
    const oversized=Array(MAX_PDF_PROFILE_POINTS+1).fill({get r(){throw Error('SHOULD_NOT_READ');},y:0});
    expect(()=>dimensionSheetLayout(oversized)).toThrow('PDF_TOO_MANY_POINTS');
    const result=await toDimensionPdf(oversized);
    expect(result.ok).toBe(false);expect(result.error).toContain('PDF_TOO_MANY_POINTS');expect(result.bytes).toBeUndefined();
  });
  it('D11: accepts the point-count boundary without spread argument limits',()=>{
    const profile=Array.from({length:MAX_PDF_PROFILE_POINTS},(_,i)=>({r:20,y:i/100}));
    expect(dimensionSheetLayout(profile).tiles).toHaveLength(1);
  });
  it('D12: rejects excessive finite coordinates including translated tiny profiles',async()=>{
    for(const profile of [
      [{r:1,y:MAX_PDF_COORDINATE_MM+1},{r:1,y:MAX_PDF_COORDINATE_MM+2}],
      [{r:1,y:-MAX_PDF_COORDINATE_MM-2},{r:1,y:-MAX_PDF_COORDINATE_MM-1}],
      [{r:MAX_PDF_COORDINATE_MM+1,y:0},{r:MAX_PDF_COORDINATE_MM+1,y:1}],
    ]){
      expect(()=>dimensionSheetLayout(profile)).toThrow('PDF_INVALID_PROFILE');
      const result=await toDimensionPdf(profile);expect(result.ok).toBe(false);expect(result.bytes).toBeUndefined();
    }
  });

  it('D13: snapshots only the twelve visible extra rows and their rendered text lengths',async()=>{
    const visible=Array.from({length:12},(_,i)=>({label:`row ${i} `+'x'.repeat(80),value:'y'.repeat(120)}));
    const parameters=[...visible];
    Object.defineProperty(parameters,12,{get:()=>{throw Error('HIDDEN_ROW_MUST_NOT_BE_READ');}});
    const result=await toDimensionPdf(referenceOuterProfile(8),{parameters});
    const expected=await toDimensionPdf(referenceOuterProfile(8),{
      parameters:visible.map((row)=>({label:row.label.slice(0,50),value:row.value.slice(0,80)})),
    });
    expect(result.ok).toBe(true);expect(result.bytes).toEqual(expected.bytes);
  });

});
