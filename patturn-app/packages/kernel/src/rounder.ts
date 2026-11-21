import { revolve, type Mesh } from './revolve.js';

export const ROUNDER_TAPER_DEG = 3;
export interface RounderOptions { mouthDiameter:number; height:number; segments?:number }

/** Solid tapered plug, mm; nominal mouth diameter occurs at mid-height.
 * Top is the narrow insertion end. No shrink/tolerance compensation is implied.
 */
export function rounderDimensions({mouthDiameter,height,segments=96}:RounderOptions) {
  if(!Number.isFinite(mouthDiameter)||mouthDiameter<20||mouthDiameter>160 ||
    !Number.isFinite(height)||height<10||height>100 ||
    !Number.isInteger(segments)||segments<24||segments>256)throw Error('INVALID_ROUNDER_DIMENSIONS');
  const delta=height/2*Math.tan(ROUNDER_TAPER_DEG*Math.PI/180);
  return {baseRadius:mouthDiameter/2+delta,tipRadius:mouthDiameter/2-delta,height,segments};
}

export function buildRounder(options:RounderOptions):Mesh {
  const {baseRadius,tipRadius,height,segments}=rounderDimensions(options);
  return revolve([{r:0,y:0},{r:baseRadius,y:0},{r:tipRadius,y:height},{r:0,y:height}],
    {segments,closeBottom:false,closeTop:false});
}
