import { describe, expect, it } from 'vitest';
import { historyShortcut } from './history-shortcut';
const base={key:'z',code:'KeyZ',ctrlKey:true,metaKey:false,altKey:false,shiftKey:false,isComposing:false,defaultPrevented:false};
describe('Layout-aware history shortcuts',()=>{
  it.each([
    [{},'undo'],[{key:'Z',shiftKey:true},'redo'],[{key:'y',code:'KeyY'},'redo'],
    [{key:'ظ'},'undo'],[{key:'ظ',shiftKey:true},'redo'],[{key:'غ',code:'KeyY'},'redo'],
    [{ctrlKey:false,metaKey:true,key:'ظ'},'undo'],
    [{ctrlKey:false},null],[{altKey:true},null],[{isComposing:true},null],[{defaultPrevented:true},null],
    [{key:'a',code:'KeyA'},null],
    [{key:'a',code:'KeyZ'},null],[{key:'w',code:'KeyY'},null],
    [{key:'Dead'},null],[{key:'Process'},null],[{key:'Unidentified'},null],[{key:''},null],
    [{key:'y',code:'KeyZ'},'redo'],[{key:'z',code:'KeyY'},'undo'],
  ] as const)('maps %j to %s',(overrides,expected)=>{
    expect(historyShortcut({...base,...overrides})).toBe(expected);
  });
});
