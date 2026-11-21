import { PATTERN_NAMES_FA } from '@patturn/config';
import { describe, expect, it } from 'vitest';
import { ParameterHistory } from './index.js';
import type { EditorState } from '@patturn/schema';
const state: EditorState={profileMode:'reference',segments:96,wall:4,shrink:12,fill:80,patternId:'dot-grid',tileSize:40};
describe('Named parameter undo/redo',()=>{
  it.each([
    ['reference','bucket','گلدان مرجع','سطل گشاد'],
    ['bucket','vase','سطل گشاد','گلدان کمر باریک'],
    ['vase','reference','گلدان کمر باریک','گلدان مرجع'],
  ] as const)('localizes profile history from %s to %s without changing stored IDs',(from,to,fromName,toName)=>{
    const initial={...state,profileMode:from};
    const h=new ParameterHistory(initial);h.record({...initial,profileMode:to});
    expect(h.undoTitle).toBe(`فرم: ${fromName} ← ${toName}`);
    expect(h.undo()).toEqual(initial);
    expect(h.redoTitle).toBe(`فرم: ${fromName} ← ${toName}`);
    expect(h.redo()!.profileMode).toBe(to);
  });
  it.each(Object.entries(PATTERN_NAMES_FA).filter(([id])=>id!==state.patternId))('localizes pattern %s while preserving its ID',(id,name)=>{
    const h=new ParameterHistory(state);h.record({...state,patternId:id});
    expect(h.undoTitle).toBe(`الگو: شبکهٔ نقطه‌ای ← ${name}`);
    expect(h.undo()).toEqual(state);
    expect(h.redoTitle).toBe(`الگو: شبکهٔ نقطه‌ای ← ${name}`);
    expect(h.redo()!.patternId).toBe(id);
  });
  it('keeps unknown pattern IDs readable rather than showing undefined',()=>{
    const h=new ParameterHistory(state);h.record({...state,patternId:'future-pattern'});
    expect(h.undoTitle).toBe('الگو: شبکهٔ نقطه‌ای ← future-pattern');
  });
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
  it('drops a completed group that returns to its full starting snapshot',()=>{
    const h=new ParameterHistory(state);h.beginGroup();h.record({...state,wall:8});h.record(state);h.endGroup();
    expect(h.current).toEqual(state);expect(h.canUndo).toBe(false);expect(h.canRedo).toBe(false);
    expect(h.undoTitle).toBeNull();expect(h.undo()).toBeNull();
  });
  it('repeated group start is idempotent and retains a single undo step',()=>{
    const h=new ParameterHistory(state);h.beginGroup();h.record({...state,wall:6});
    h.beginGroup();h.record({...state,wall:8});h.endGroup();
    expect(h.undo()).toEqual(state);expect(h.canUndo).toBe(false);expect(h.redo()!.wall).toBe(8);
  });
  it('removes only the net-zero group and preserves earlier meaningful edits',()=>{
    const h=new ParameterHistory(state);h.record({...state,fill:50});h.beginGroup();
    h.record({...state,fill:50,wall:6});h.record({...state,fill:50});h.endGroup();
    expect(h.undo()).toEqual(state);expect(h.redo()!.fill).toBe(50);expect(h.canRedo).toBe(false);
  });

  it('restores the redo branch after a completed net-zero gesture',()=>{
    const h=new ParameterHistory(state);h.record({...state,wall:6});h.undo();
    h.beginGroup();h.record({...state,wall:8});h.record(state);h.endGroup();
    expect(h.canUndo).toBe(false);expect(h.canRedo).toBe(true);expect(h.redo()!.wall).toBe(6);
  });
  it('restores the oldest entry displaced by a temporary group at capacity',()=>{
    const h=new ParameterHistory(state,2);h.record({...state,wall:5});h.record({...state,wall:6});
    h.beginGroup();h.record({...state,wall:7});h.record({...state,wall:6});h.endGroup();
    expect(h.undo()!.wall).toBe(5);expect(h.undo()).toEqual(state);expect(h.canUndo).toBe(false);
  });
  it('still discards a redo branch when the group ends with a real change',()=>{
    const h=new ParameterHistory(state);h.record({...state,wall:6});h.undo();
    h.beginGroup();h.record({...state,wall:8});h.endGroup();
    expect(h.canRedo).toBe(false);expect(h.undo()).toEqual(state);expect(h.redo()!.wall).toBe(8);
  });

});
