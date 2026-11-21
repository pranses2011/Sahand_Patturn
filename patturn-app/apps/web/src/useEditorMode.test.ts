import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { EDITOR_MODE_KEY, useEditorMode } from './useEditorMode';
function setup(storage: Parameters<typeof useEditorMode>[0]){
  let api!:ReturnType<typeof useEditorMode>;
  function Host(){api=useEditorMode(storage);return null;}
  let tree!:ReturnType<typeof create>;act(()=>{tree=create(createElement(Host));});
  return {get api(){return api;},close:()=>act(()=>tree.unmount())};
}
describe('Local editor-mode preference',()=>{
  it.each([null,'broken','simple','pro'])('loads %s without writing on mount',(stored)=>{
    const setItem=vi.fn(),h=setup(()=>({getItem:()=>stored,setItem}));
    expect(h.api.mode).toBe(stored==='pro'?'pro':'simple');expect(setItem).not.toHaveBeenCalled();h.close();
  });
  it('persists explicit changes separately from project data',()=>{
    const setItem=vi.fn(),h=setup(()=>({getItem:()=>null,setItem}));
    act(()=>h.api.changeMode('pro'));expect(h.api.mode).toBe('pro');
    expect(setItem).toHaveBeenCalledExactlyOnceWith(EDITOR_MODE_KEY,'pro');expect(h.api.error).toBe(false);h.close();
  });
  it('survives blocked storage and clears the warning when a later change succeeds',()=>{
    let blocked=true;const h=setup(()=>{if(blocked)throw Error('blocked');return {getItem:()=>null,setItem:()=>{}};});
    expect(h.api.mode).toBe('simple');expect(h.api.error).toBe(true);
    act(()=>h.api.changeMode('pro'));expect(h.api.mode).toBe('pro');expect(h.api.error).toBe(true);
    blocked=false;act(()=>h.api.changeMode('simple'));expect(h.api.error).toBe(false);h.close();
  });
});
