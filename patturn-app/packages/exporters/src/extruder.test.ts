import { beforeAll, expect, it } from 'vitest';
import DxfParser from 'dxf-parser';
import { extruderDrawing } from './extruder.js';
import { toSvg, toDxf, toBinaryStl } from './index.js';
import { initCsg, buildExtruderDie } from '@patturn/molds';
beforeAll(async () => {
  await initCsg();
});
it.each([1, 6, 12])(
  'exports the same %s holes as closed SVG/DXF boundaries and validated STL',
  (count) => {
    const options = { diameterMm: 60, thicknessMm: 8, holeDiameterMm: 4, count, orbitRadiusMm: 16 };
    const drawing = extruderDrawing(options);
    expect(drawing.paths).toHaveLength(count + 1);
    const svg = toSvg(drawing.paths, drawing.width, drawing.height, { strokeMm: 0.2 });
    expect(svg.ok, svg.error).toBe(true);
    expect(new TextDecoder().decode(svg.bytes)).toContain(`width="${drawing.width}mm"`);
    const dxf = toDxf(drawing.paths);
    expect(dxf.ok, dxf.error).toBe(true);
    const entities = new DxfParser().parseSync(new TextDecoder().decode(dxf.bytes))!
      .entities as unknown as { shape: boolean; vertices: unknown[] }[];
    expect(entities).toHaveLength(count + 1);
    expect(entities.every((e) => e.shape)).toBe(true);
    expect(entities[0]!.vertices).toHaveLength(128);
    expect(entities.slice(1).every((e) => e.vertices.length === 64)).toBe(true);
    const stl = toBinaryStl(buildExtruderDie(options), 'extruder');
    expect(stl.ok, stl.error).toBe(true);
    expect(stl.validation!.euler).toBe(2 - 2 * count);
    expect(stl.bytes!.length).toBe(84 + 50 * new DataView(stl.bytes!.buffer).getUint32(80, true));
  },
);
