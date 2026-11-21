import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { NumericControl, normalizeControlValue } from './NumericControl';

describe('Numeric draft editing',()=>{
  it('does not commit partial typing until blur and restores blank/invalid input',()=>{
    const changed=vi.fn(),end=vi.fn();let tree!:ReturnType<typeof create>;
    act(()=>{tree=create(createElement(NumericControl,{label:'ضخامت',value:4,min:1,max:20,onChange:changed,onBeginEdit:()=>{},onEndEdit:end}));});
    const number=()=>tree.root.findByProps({type:'number'});
    act(()=>number().props.onChange({currentTarget:{value:''}}));
    expect(number().props.value).toBe('');expect(changed).not.toHaveBeenCalled();
    act(()=>number().props.onBlur({currentTarget:{valueAsNumber:NaN}}));
    expect(number().props.value).toBe('4');expect(changed).not.toHaveBeenCalled();
    act(()=>number().props.onChange({currentTarget:{value:'12'}}));
    act(()=>number().props.onBlur({currentTarget:{valueAsNumber:12}}));
    expect(changed).toHaveBeenCalledWith(12);expect(end).toHaveBeenCalledTimes(2);
    act(()=>tree.unmount());
  });
  it('normalizes finite commits to the configured range/step without floating-point display noise',()=>{
    expect(normalizeControlValue(40,1,20,1)).toBe(20);
    expect(normalizeControlValue(-4,1,20,1)).toBe(1);
    expect(normalizeControlValue(12.7,0,20,.5)).toBe(12.5);
    expect(normalizeControlValue(.3,0,1,.1)).toBe(.3);
  });
  it.each([
    [4, 1, 10, 2, 5],
    [10, 1, 10, 2, 9],
    [100, 1, 10, 2, 9],
    [-100, 1, 10, 2, 1],
    [.3, .1, 1, .2, .3],
    [1, .1, 1, .2, .9],
    [-.6, -.9, .9, .2, -.5],
    [5, 1, 1.1, 2, 1],
    [.3, 0, .3, .1, .3],
  ])('anchors %s to min=%s max=%s step=%s yielding %s',(input,min,max,step,expected)=>{
    expect(normalizeControlValue(input,min,max,step)).toBe(expected);
    expect(normalizeControlValue(expected,min,max,step)).toBe(expected);
  });
  it('expires correction feedback across external changes, even when the old value returns',()=>{
    let tree!:ReturnType<typeof create>;
    const props={label:'ضخامت',min:1,max:20,onChange:vi.fn(),onBeginEdit:()=>{},onEndEdit:()=>{}};
    act(()=>{tree=create(createElement(NumericControl,{...props,value:4}));});
    act(()=>tree.root.findByProps({type:'number'}).props.onBlur({currentTarget:{valueAsNumber:100}}));
    act(()=>tree.update(createElement(NumericControl,{...props,value:20})));
    expect(tree.root.findByProps({role:'status'}).children.join('')).toContain('۲۰');
    act(()=>tree.update(createElement(NumericControl,{...props,value:4})));
    expect(tree.root.findByProps({role:'status'}).children).toEqual([]);
    act(()=>tree.update(createElement(NumericControl,{...props,value:20})));
    expect(tree.root.findByProps({role:'status'}).children).toEqual([]);
    act(()=>tree.unmount());
  });
  it('reflects external undo or project loads in the draft',()=>{
    let tree!:ReturnType<typeof create>;
    const props={label:'ضخامت',min:1,max:20,onChange:()=>{},onBeginEdit:()=>{},onEndEdit:()=>{}};
    act(()=>{tree=create(createElement(NumericControl,{...props,value:4}));});
    act(()=>tree.update(createElement(NumericControl,{...props,value:8})));
    expect(tree.root.findByProps({type:'number'}).props.value).toBe('8');act(()=>tree.unmount());
  });
});
