import { describe, expect, it } from 'vitest';
import { buildJigsaw } from './jigsaw.js';
const defaults={rows:3,columns:3,cellMm:40,tabMm:3,seed:42};
describe('Deterministic shared-edge jigsaw drawing',()=>{
  const cases=[2,3,6].flatMap((rows)=>[2,3,6].flatMap((columns)=>[20,40,60].map((cellMm)=>({rows,columns,cellMm,tabMm:cellMm/6,seed:42}))));
  it.each(cases)('has one outer contour and each interior edge once for %j',(options)=>{
    const drawing=buildJigsaw(options),internal=(options.rows-1)*options.columns+(options.columns-1)*options.rows;
    expect(drawing.paths.length).toBe(internal+1);expect(drawing.width).toBe(options.columns*options.cellMm);
    expect(drawing.height).toBe(options.rows*options.cellMm);expect(drawing.paths[0]!.d.endsWith('Z')).toBe(true);
    const edges=new Set<string>();
    for(const path of drawing.paths.slice(1)){
      expect(path.d.match(/C/g)).toHaveLength(3);
      const values=path.d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      const start=values.slice(0,2),end=values.slice(-2);
      const key=[start.join(','),end.join(',')].sort().join(':');expect(edges.has(key)).toBe(false);edges.add(key);
      // Bézier curves stay within the convex hull of these bounded control points.
      for(let i=0;i<values.length;i+=2){
        expect(values[i]).toBeGreaterThanOrEqual(0);expect(values[i]).toBeLessThanOrEqual(drawing.width);
        expect(values[i+1]).toBeGreaterThanOrEqual(0);expect(values[i+1]).toBeLessThanOrEqual(drawing.height);
      }
    }
  });
  it('repeats identical paths for the same seed but changes tab direction with a new seed',()=>{
    const before={...defaults};expect(buildJigsaw(defaults)).toEqual(buildJigsaw(defaults));
    expect(buildJigsaw({...defaults,seed:43})).not.toEqual(buildJigsaw(defaults));expect(defaults).toEqual(before);
  });
  it.each([{rows:1},{rows:6.5},{columns:7},{cellMm:NaN},{cellMm:61},{tabMm:0},{tabMm:8},{seed:-1},{seed:65536}])('rejects invalid options %j',(override)=>{
    expect(()=>buildJigsaw({...defaults,...override})).toThrow('INVALID_JIGSAW_OPTIONS');
  });
});
