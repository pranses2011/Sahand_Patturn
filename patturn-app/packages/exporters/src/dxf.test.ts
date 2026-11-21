import { describe, expect, it } from 'vitest';
import { toDxf } from './index.js';
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
