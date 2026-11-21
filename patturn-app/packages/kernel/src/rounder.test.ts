import { describe, expect, it } from 'vitest';
import { buildRounder, rounderDimensions, ROUNDER_TAPER_DEG } from './rounder.js';
import { validateMesh } from './mesh-validate.js';
const defaults={mouthDiameter:80,height:40};
describe('Three-degree mouth rounder',()=>{
  const cases=[20,80,160].flatMap((mouthDiameter)=>[10,40,100].flatMap((height)=>[24,96,256].map((segments)=>({mouthDiameter,height,segments}))));
  it.each(cases)('is watertight with a nominal mid-height diameter for %j',(options)=>{
    const dimensions=rounderDimensions(options),mesh=buildRounder(options),report=validateMesh(mesh);
    expect(report.ok).toBe(true);expect(report.euler).toBe(2);expect(report.openEdges).toBe(0);
    const {baseRadius:a,tipRadius:b}=dimensions;
    expect(a+b).toBeCloseTo(options.mouthDiameter,10);expect(b).toBeGreaterThan(0);
    expect(Math.atan((a-b)/options.height)*180/Math.PI).toBeCloseTo(ROUNDER_TAPER_DEG,10);
    const exact=Math.PI*options.height*(a*a+a*b+b*b)/3;
    const factor=options.segments*Math.sin(2*Math.PI/options.segments)/(2*Math.PI);
    expect(Math.abs(report.signedVolumeMm3-exact*factor)/exact).toBeLessThan(1e-6);
  });
  it.each([{mouthDiameter:NaN},{mouthDiameter:19},{mouthDiameter:161},{height:0},{height:101},{segments:23},{segments:Infinity},{segments:96.5}])('rejects invalid options %j',(override)=>{
    expect(()=>buildRounder({...defaults,...override})).toThrow('INVALID_ROUNDER_DIMENSIONS');
  });
  it('is deterministic and never mutates its caller options',()=>{
    const input={...defaults},before={...input};
    expect(buildRounder(input)).toEqual(buildRounder(input));expect(input).toEqual(before);
  });
});
