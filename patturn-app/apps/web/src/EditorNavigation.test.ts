import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { EditorNavigation, type EditorSection } from './EditorNavigation';

describe('Native editor navigation',()=>{
  it.each(['form','pattern','mold','export'] as EditorSection[])('identifies only %s as current and exposes four buttons',(section)=>{
    let tree!:ReturnType<typeof create>;
    const change=vi.fn();act(()=>{tree=create(createElement(EditorNavigation,{section,onChange:change}));});
    expect(tree.root.findByType('nav').props['aria-label']).toBe('بخش‌های طراحی');
    const buttons=tree.root.findAllByType('button');expect(buttons).toHaveLength(4);
    expect(buttons.filter((b)=>b.props['aria-current']==='page')).toHaveLength(1);
    expect(buttons.every((b)=>b.props.type==='button'&&b.props.tabIndex===undefined)).toBe(true);
    act(()=>buttons[1]!.props.onClick());expect(change).toHaveBeenCalledWith('pattern');
    act(()=>tree.unmount());
  });
});
