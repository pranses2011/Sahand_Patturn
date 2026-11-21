import type { Path } from './index.js';

export interface JigsawOptions { rows:number; columns:number; cellMm:number; tabMm:number; seed:number }

/** Shared cut-line drawing, not disconnected piece outlines or kerf compensation.
 * Every internal edge is generated once, preventing coincident duplicate cuts.
 */
export function buildJigsaw({rows,columns,cellMm,tabMm,seed}:JigsawOptions):{paths:Path[];width:number;height:number} {
  if(!Number.isInteger(rows)||rows<2||rows>6 || !Number.isInteger(columns)||columns<2||columns>6 ||
    !Number.isFinite(cellMm)||cellMm<20||cellMm>60 || !Number.isFinite(tabMm)||tabMm<1||tabMm>cellMm/6 ||
    !Number.isInteger(seed)||seed<0||seed>65535)throw Error('INVALID_JIGSAW_OPTIONS');
  let state=seed;
  const sign=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state&0x80000000 ? 1 : -1;};
  const width=columns*cellMm,height=rows*cellMm;
  const paths:Path[]=[{d:`M0 0 L${width} 0 L${width} ${height} L0 ${height} Z`}];
  const edge=(x:number,y:number,dx:number,dy:number)=>{
    const s=sign(),nx=-dy,ny=dx;
    const point=(t:number,depth:number)=>`${Number((x+dx*cellMm*t+nx*tabMm*depth*s).toFixed(6))} ${Number((y+dy*cellMm*t+ny*tabMm*depth*s).toFixed(6))}`;
    return {d:`M${point(0,0)} L${point(.4,0)} C${point(.4,.15)} ${point(.25,1)} ${point(.4,1)} C${point(.45,1.3)} ${point(.55,1.3)} ${point(.6,1)} C${point(.75,1)} ${point(.6,.15)} ${point(.6,0)} L${point(1,0)}`};
  };
  for(let row=1;row<rows;row++)for(let col=0;col<columns;col++)paths.push(edge(col*cellMm,row*cellMm,1,0));
  for(let col=1;col<columns;col++)for(let row=0;row<rows;row++)paths.push(edge(col*cellMm,row*cellMm,0,1));
  return {paths,width,height};
}
