import { beforeAll, describe, expect, it } from 'vitest';
import { buildFootRing, revolve, validateMesh } from '@patturn/kernel';
import { initCsg, unionFootRing } from './csg.js';
beforeAll(async()=>{await initCsg();});
const form=()=>revolve([{r:0,y:0},{r:40,y:0},{r:40,y:80},{r:0,y:80}],{segments:96});
describe('Foot ring and body union',()=>{
  it.each(['square','chamfer','round'] as const)('unites %s edges and keeps the base centered and closed',(edge)=>{
    const body=form(),before=body.positions.slice();
    const ring=buildFootRing({outerRadius:34,width:6,depth:4,floorY:0,edge});
    const mesh=unionFootRing(body,ring),report=validateMesh(mesh);
    expect(report.ok).toBe(true);expect(report.euler).toBe(2);
    expect(report.signedVolumeMm3).toBeGreaterThan(validateMesh(body).signedVolumeMm3);
    expect(report.signedVolumeMm3).toBeLessThan(validateMesh(body).signedVolumeMm3+validateMesh(ring).signedVolumeMm3);
    const ys=Array.from(mesh.positions).filter((_,i)=>i%3===1);expect(Math.min(...ys)).toBe(-4);expect(Math.max(...ys)).toBe(80);
    expect(body.positions).toEqual(before);
  });
  it('rejects a disjoint ring rather than claiming it joined the form',()=>{
    const ring=buildFootRing({outerRadius:34,width:6,depth:4,floorY:-20,edge:'square'});
    expect(()=>unionFootRing(form(),ring)).toThrow('FOOT_RING_NOT_JOINED');
  });
  it('rejects a wholly buried ring rather than claiming a new foot',()=>{
    const ring=buildFootRing({outerRadius:34,width:6,depth:4,floorY:40,edge:'square'});
    expect(()=>unionFootRing(form(),ring)).toThrow('FOOT_RING_NOT_JOINED');
  });
});
