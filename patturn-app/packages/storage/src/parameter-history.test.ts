import { describe, expect, it } from 'vitest';
import { ParameterHistory } from './index.js';
import type { EditorState } from '@patturn/schema';
const state: EditorState={profileMode:'reference',segments:96,wall:4,shrink:12,fill:80,patternId:'dot-grid',tileSize:40};
describe('Named parameter undo/redo',()=>{
  it('UHI1: named undo and redo restore complete snapshots',()=>{
    const h=new ParameterHistory(state);
    expect(h.undo()).toBeNull();
    h.record({...state,wall:6,fill:50});
    expect(h.undoTitle).toContain('ضخامت'); expect(h.undoTitle).toContain('پرشدگی');
    expect(h.undo()).toEqual(state); expect(h.canRedo).toBe(true);
    expect(h.redo()!.wall).toBe(6); expect(h.redo()).toBeNull();
  });
  it('UHI2: new changes after undo discard the redo branch',()=>{
    const h=new ParameterHistory(state);h.record({...state,wall:6});h.undo();
    h.record({...state,fill:30});expect(h.canRedo).toBe(false);expect(h.current.fill).toBe(30);
  });
  it('UHI3: range gesture coalesces to one action with original baseline',()=>{
    const h=new ParameterHistory(state);h.beginGroup();
    for(let wall=5;wall<15;wall++)h.record({...state,wall});
    h.endGroup();expect(h.undoTitle).toContain('۴');
    expect(h.undo()).toEqual(state);expect(h.canUndo).toBe(false);expect(h.redo()!.wall).toBe(14);
  });
  it('UHI4: bounded to 50 actions, snapshots never alias caller objects',()=>{
    const h=new ParameterHistory(state);const input={...state,fill:1};h.record(input);input.fill=99;
    expect(h.current.fill).toBe(1);
    for(let fill=2;fill<=70;fill++)h.record({...state,fill});
    let count=0;while(h.undo())count++;
    expect(count).toBe(50);expect(h.current.fill).toBe(20);
    const current=h.current;current.fill=99;expect(h.current.fill).toBe(20);
  });
  it('UHI5: unchanged states do not add actions and invalid states cannot corrupt history',()=>{
    const h=new ParameterHistory(state);expect(h.record({...state})).toBe(false);
    expect(()=>h.record({...state,wall:NaN})).toThrow();expect(h.canUndo).toBe(false);
    h.beginGroup();h.endGroup();expect(h.undo()).toBeNull();
  });
});
