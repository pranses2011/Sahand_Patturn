import type { Mesh } from './revolve.js';

export interface ChuckOptions { baseDiameter:number; height:number; drainDiameter:number; segments?:number }
export const CHUCK_TAPER_DEG = 2;

/** Closed annular tapered support, mm. The axial drain is open at both ends.
 * Four shared rings form a genus-one solid; no disk caps obstruct the drain.
 * Geometric construction only, not a load/speed or physical-use certification.
 */
export function buildChuck({baseDiameter,height,drainDiameter,segments=96}:ChuckOptions):Mesh {
  if(!Number.isFinite(baseDiameter)||baseDiameter<40||baseDiameter>200 ||
    !Number.isFinite(height)||height<10||height>100 ||
    !Number.isFinite(drainDiameter)||drainDiameter<4||drainDiameter>20 ||
    !Number.isInteger(segments)||segments<24||segments>256)throw Error('INVALID_CHUCK_DIMENSIONS');
  const base=baseDiameter/2,hole=drainDiameter/2;
  const top=base-height*Math.tan(CHUCK_TAPER_DEG*Math.PI/180);
  if(top-hole<3)throw Error('CHUCK_WALL_TOO_THIN');
  const rings=[{r:hole,y:0},{r:base,y:0},{r:top,y:height},{r:hole,y:height}];
  const positions=new Float32Array(4*segments*3),indices=new Uint32Array(4*segments*6);
  for(let ring=0;ring<4;ring++){
    const point=rings[ring]!;
    for(let s=0;s<segments;s++){
      const angle=2*Math.PI*s/segments,offset=(ring*segments+s)*3;
      positions[offset]=point.r*Math.cos(angle);positions[offset+1]=point.y;positions[offset+2]=point.r*Math.sin(angle);
      const a=ring*segments+s,b=ring*segments+(s+1)%segments;
      const c=((ring+1)%4)*segments+(s+1)%segments,d=((ring+1)%4)*segments+s;
      indices.set([a,c,b,a,d,c],(ring*segments+s)*6);
    }
  }
  return {positions,indices};
}
