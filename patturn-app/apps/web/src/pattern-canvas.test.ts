import { describe, expect, it, vi } from 'vitest';
import { PATTERNS } from '@patturn/patterns';
import { createPatternCanvas } from './pattern-canvas';

describe('On-demand physical pattern canvas',()=>{
  it('does not build until consumed and shares one result across consumers',()=>{
    const def=PATTERNS[0]!,build=vi.fn(def.build),get=createPatternCanvas({...def,build},40);
    expect(build).not.toHaveBeenCalled();const first=get();expect(get()).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);
    expect(build.mock.calls[0]![0]).toMatchObject({canvasW:300,canvasH:300,tileW:40,tileH:40,seed:42});
  });
  it('isolates new inputs and matches the previous deterministic full-canvas output',()=>{
    const def=PATTERNS[0]!,before={...def.defaults};
    const a=createPatternCanvas(def,40),b=createPatternCanvas(def,60);
    expect(a()).toEqual(def.build({canvasW:300,canvasH:300,tileW:40,tileH:40,seed:42,params:{...def.defaults}}));
    expect(b()).not.toEqual(a());expect(def.defaults).toEqual(before);
  });
  it('retries a failed build and caches even empty successful results',()=>{
    const build=vi.fn().mockImplementationOnce(()=>{throw Error('failed');}).mockReturnValue([]);
    const get=createPatternCanvas({...PATTERNS[0]!,build},40);
    expect(()=>get()).toThrow('failed');expect(get()).toEqual([]);expect(get()).toEqual([]);
    expect(build).toHaveBeenCalledTimes(2);
  });
});
