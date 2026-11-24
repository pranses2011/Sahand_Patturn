import { describe, it, expect } from 'vitest';
import { buildRib } from '@patturn/patterns';
import { referenceOuterProfile, radialCavityProfile, buildRibMesh } from '@patturn/kernel';
import DxfParser from 'dxf-parser';
import { toSvg, toDxf, toBinaryStl } from './index.js';

describe('Rib template exports from the current cavity profile', () => {
  it.each([5, 20, 80])('exports mm SVG and independently readable DXF at backing %s', (backing) => {
    const profile = radialCavityProfile(referenceOuterProfile(48), 4);
    const drawing = buildRib(profile, backing);
    const svg = toSvg(drawing.paths, drawing.width, drawing.height, { strokeMm: 0.2 });
    expect(svg.ok, svg.error).toBe(true);
    expect(new TextDecoder().decode(svg.bytes)).toContain(`width="${drawing.width}mm"`);
    const dxf = toDxf(drawing.paths);
    expect(dxf.ok, dxf.error).toBe(true);
    const doc = new DxfParser().parseSync(new TextDecoder().decode(dxf.bytes))!;
    expect(doc.entities).toHaveLength(1);
    const entity = doc.entities[0] as unknown as {
      shape: boolean;
      vertices: { x: number; y: number }[];
    };
    expect(entity.shape).toBe(true);
    expect(entity.vertices).toHaveLength(profile.length + 2);
    drawing.contact.forEach(([x, y], i) => {
      expect(entity.vertices[i]!.x).toBeCloseTo(x, 5);
      expect(entity.vertices[i]!.y).toBeCloseTo(y, 5);
    });
  });
});

it('exports a validated rib STL with exact triangle byte count and mm header', () => {
  const drawing = buildRib(radialCavityProfile(referenceOuterProfile(48), 4), 20);
  const mesh = buildRibMesh(drawing.contact, 4);
  const result = toBinaryStl(mesh, 'rib');
  expect(result.ok, result.error).toBe(true);
  expect(result.validation!.openEdges).toBe(0);
  expect(result.validation!.euler).toBe(2);
  expect(result.bytes!.length).toBe(84 + (mesh.indices.length / 3) * 50);
  expect(new TextDecoder().decode(result.bytes!.slice(0, 80))).toContain('mm');
});
