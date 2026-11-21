import { describe, it, expect } from 'vitest';
import { toBinaryStl, toSvg, toDxf, exportName } from './index.js';
import { referenceOuterProfile, revolve } from '@patturn/kernel';
import { dotGrid } from '@patturn/patterns';

describe('X — exporters', () => {
  const mesh = revolve(referenceOuterProfile(24), { segments: 24, closeTop: true });

  it('X1: STL export passes validation and has correct binary size', () => {
    const res = toBinaryStl(mesh, 'test-vessel');
    expect(res.ok).toBe(true);
    const triCount = mesh.indices.length / 3;
    expect(res.bytes!.length).toBe(84 + triCount * 50);
    // triangle count at offset 80
    const dv = new DataView(res.bytes!.buffer);
    expect(dv.getUint32(80, true)).toBe(triCount);
  });

  it('X2: STL header is ASCII (no binary junk in first 80 bytes)', () => {
    const res = toBinaryStl(mesh, 'hdr');
    const header = new TextDecoder().decode(res.bytes!.slice(0, 80));
    expect(header).toMatch(/Patturn/);
  });

  it('X3: invalid mesh (open) is rejected', () => {
    const openMesh = revolve(referenceOuterProfile(8), {
      segments: 8,
      closeBottom: false,
      closeTop: false,
    });
    const res = toBinaryStl(openMesh, 'bad');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('MESH_INVALID');
  });

  it('X4: SVG declares mm units and viewBox matches canvas', () => {
    const paths = dotGrid.build({
      canvasW: 300,
      canvasH: 200,
      tileW: 40,
      tileH: 40,
      seed: 1,
      params: { radius: 2 },
    });
    const res = toSvg(paths, 300, 200);
    const text = new TextDecoder().decode(res.bytes!);
    expect(text).toContain('width="300mm"');
    expect(text).toContain('height="200mm"');
    expect(text).toContain('viewBox="0 0 300 200"');
  });

  it('X5: 100mm line → 100 user units in SVG (site contract T7)', () => {
    const res = toSvg([{ d: 'M0 0L100 0', fill: false }], 100, 10);
    const text = new TextDecoder().decode(res.bytes!);
    expect(text).toContain('d="M0 0L100 0"');
  });

  it('X6: DXF contains SECTION/ENTITIES/EOF', () => {
    const res = toDxf([{ d: 'M10 10L50 10L50 40', fill: false }]);
    const text = new TextDecoder().decode(res.bytes!);
    expect(text).toContain('SECTION');
    expect(text).toContain('ENTITIES');
    expect(text).toContain('EOF');
    expect(text).toContain('POLYLINE');
  });

  it('X7: export naming contract — slug_target_dims.ext', () => {
    expect(exportName('گلدان بلند', 'mold-part', '145x148', 'stl')).toBe(
      'گلدان-بلند_mold-part_145x148.stl',
    );
    expect(exportName('  /// ', 'form', '0x0', 'stl')).toBe('project_form_0x0.stl');
  });
});
