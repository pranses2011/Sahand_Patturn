import { describe, expect, it } from 'vitest';
import { clipCircle, clipLine } from './dxf-clip.js';
import { toDxf } from './index.js';
const b={width:100,height:80};
describe('Geometric DXF canvas clipping',()=>{
  it('clips crossing lines and excludes exterior, tangent-point and degenerate segments',()=>{
    expect(clipLine([-10,40],[110,40],b)).toEqual([[0,40],[100,40]]);
    expect(clipLine([50,-10],[50,90],b)).toEqual([[50,0],[50,80]]);
    expect(clipLine([-10,5],[-1,5],b)).toBeNull();
    expect(clipLine([1,1],[1,1],b)).toBeNull();
    expect(clipLine([-10,10],[10,-10],b)).toBeNull();
    expect(clipLine([0,0],[100,0],b)).toEqual([[0,0],[100,0]]);
  });
  it('preserves complete circles and drops wholly outside or enclosing circles',()=>{
    expect(clipCircle({x:50,y:40,radius:10},b)).toEqual([[0,2*Math.PI]]);
    expect(clipCircle({x:-20,y:40,radius:5},b)).toEqual([]);
    expect(clipCircle({x:50,y:40,radius:1000},b)).toEqual([]);
  });
  it('clips edge and corner circles to exact half and quarter arcs',()=>{
    expect(clipCircle({x:0,y:40,radius:10},b)).toEqual([[0,Math.PI/2],[3*Math.PI/2,2*Math.PI]]);
    expect(clipCircle({x:0,y:0,radius:10},b)).toEqual([[0,Math.PI/2]]);
  });
  it('samples every retained arc inside bounds for circles crossing multiple sides',()=>{
    for(const c of [{x:50,y:40,radius:55},{x:99,y:79,radius:20},{x:-1,y:20,radius:30}]){
      for(const [a,z] of clipCircle(c,b))for(let i=1;i<100;i++){
        const t=a+(z-a)*i/100,x=c.x+c.radius*Math.cos(t),y=c.y+c.radius*Math.sin(t);
        expect(x).toBeGreaterThanOrEqual(-1e-8);expect(x).toBeLessThanOrEqual(100+1e-8);
        expect(y).toBeGreaterThanOrEqual(-1e-8);expect(y).toBeLessThanOrEqual(80+1e-8);
      }
    }
  });
  it('writes clipped LINE/ARC entities without inventing a closure across canvas edges',()=>{
    const result=toDxf([{d:'M-10 40L110 40'}, {d:'M-10 0a10 10 0 1 0 20 0a10 10 0 1 0 -20 0z'}],b);
    expect(result.ok).toBe(true);const s=new TextDecoder().decode(result.bytes);
    expect(s).toContain('\nLINE\n');expect(s).toContain('\nARC\n');
    expect(s).not.toContain('\nPOLYLINE\n');expect(s).not.toContain('\nCIRCLE\n');
    expect(toDxf([{d:'M0 0L1 1'}],{width:NaN,height:80}).ok).toBe(false);
  });
});
