import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { dotGrid, wave, type PatternDef } from '@patturn/patterns';
import { usePreviewPattern } from './usePreviewPattern';

describe('Stable bounded pattern preview payload',()=>{
  it('does not rebuild the tile or change object identity on unrelated rerenders',()=>{
    const build=vi.fn(dotGrid.build),def={...dotGrid,build};
    let result!:ReturnType<typeof usePreviewPattern>;
    function Host({size}:{size:number}){result=usePreviewPattern(def,size);return null;}
    let tree!:ReturnType<typeof create>;act(()=>{tree=create(createElement(Host,{size:8}));});
    const first=result;expect(result.paths).toHaveLength(1);
    act(()=>tree.update(createElement(Host,{size:8})));
    expect(result).toBe(first);expect(build).toHaveBeenCalledTimes(1);
    expect(build.mock.calls[0]![0]).toMatchObject({canvasW:8,canvasH:8,tileW:8,tileH:8,seed:42});
    act(()=>tree.update(createElement(Host,{size:40})));
    expect(result).not.toBe(first);expect(result.tileW).toBe(40);expect(build).toHaveBeenCalledTimes(2);
    act(()=>tree.unmount());
  });
  it('updates with selected pattern and retains deterministic defaults without mutating them',()=>{
    let result!:ReturnType<typeof usePreviewPattern>;
    function Host({def}:{def:PatternDef}){result=usePreviewPattern(def,40);return null;}
    const defaults=JSON.stringify(wave.defaults);
    let tree!:ReturnType<typeof create>;act(()=>{tree=create(createElement(Host,{def:dotGrid}));});
    const first=result;
    act(()=>tree.update(createElement(Host,{def:wave})));
    expect(result).not.toBe(first);expect(result.paths).toHaveLength(1);
    expect(result.paths[0]!.d).toContain('C');expect(result.strokeMm).toBe(1.5);
    expect(JSON.stringify(wave.defaults)).toBe(defaults);act(()=>tree.unmount());
  });
});
