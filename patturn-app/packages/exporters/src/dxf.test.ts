import { describe, expect, it } from 'vitest';
import { toDxf } from './index.js';
import { PATTERNS } from '@patturn/patterns';
const text=(d:string)=>new TextDecoder().decode(toDxf([{d}]).bytes);
describe('Fail-closed linear DXF',()=>{
  it('supports relative segments, implicit coordinate pairs, H/V and closed contours',()=>{
    const s=text('M10 20 30 20h10v20l-30 0z');
    expect(s).toContain('70\n1\n10\n0\n20\n0');
    expect(s).toContain('10\n40\n20\n40\n30\n0');
    expect(s).toContain('10\n10\n20\n40\n30\n0');
    expect(s).toContain('$MEASUREMENT\n70\n1');
    expect(s).toContain('2\nLAYER');
  });
  it('keeps disconnected subpaths separate without an invented connector',()=>{
    const s=text('M0 0L10 0M20 20L30 20');
    expect(s.match(/\nPOLYLINE\n/g)).toHaveLength(2);
    expect(s.match(/\nSEQEND\n/g)).toHaveLength(2);
  });
  it.each(['M0 0C1 2 3 4 5 6','M0 0A2 2 0 0 1 4 0','M0 0LNaN 1','M0 0L1e999 2','L0 0L1 1','M0 0L1','M0 0<bad>','M0 0z',''])('rejects incomplete or unsupported input: %s',(d)=>{
    const r=toDxf([{d:'M0 0L1 1'},{d}]);expect(r.ok).toBe(false);expect(r.bytes).toBeUndefined();
  });
  it('does not misidentify an arbitrary arc as a circle',()=>{
    expect(toDxf([{d:'M0 0a2 3 0 1 0 4 0a2 3 0 1 0 -4 0z'}]).ok).toBe(false);
  });
});

describe('Canonical DXF circles',()=>{
  it('converts the complete two-arc circle without approximating its center or radius',()=>{
    const r=toDxf([{d:'M7.5 20a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0z',fill:true}]);
    expect(r.ok).toBe(true);
    const s=new TextDecoder().decode(r.bytes);
    expect(s).toContain('CIRCLE\n8\noutline\n10\n10\n20\n20\n30\n0\n40\n2.5');
    expect(s).not.toContain('POLYLINE');
  });
  it.each([
    'M0 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0zM0 0L1 1',
    'M0 0a2 2 0 1 0 4 0a2 2 0 1 0 -3 0z',
    'M0 0a2 2 0 1 0 4 0a2 3 0 1 0 -4 0z',
    'M0 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 1z',
  ])('rejects near-circle or extra geometry rather than discarding it: %s',(d)=>{
    expect(toDxf([{d}]).ok).toBe(false);
  });
});

it('exports all supported library patterns and rejects general curves as a whole',()=>{
  for (const pattern of PATTERNS) {
    const paths=pattern.build({canvasW:80,canvasH:80,tileW:40,tileH:40,seed:42,params:{...pattern.defaults}});
    expect(toDxf(paths).ok,pattern.id).toBe(!['wave','scale','seigaiha'].includes(pattern.id));
  }
});
