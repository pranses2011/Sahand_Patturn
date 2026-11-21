import { PATTERN_NAMES_FA } from '@patturn/config';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { act, create } from 'react-test-renderer';
import { PATTERNS } from '@patturn/patterns';
import { PatternLibrary } from './PatternLibrary';

describe('Pattern selection cards', () => {
  it.each(PATTERNS.map((p) => p.id))('renders all patterns with only %s selected', (id) => {
    const html = renderToStaticMarkup(
      createElement(PatternLibrary, { selectedId: id, onSelect: () => {} }),
    );
    expect(html.match(/type="radio"/g)).toHaveLength(PATTERNS.length);
    expect(html.match(/<svg/g)).toHaveLength(PATTERNS.length);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toContain(`value="${id}"`);
    expect(html).toContain('اندازهٔ واقعی پروژه');
    expect(html).not.toMatch(/https?:|<img|<script/);
    expect(html).toContain('شبکهٔ نقطه‌ای');
  });
  it('has one Persian display name for every built-in pattern and no stale names', () => {
    expect(Object.keys(PATTERN_NAMES_FA).sort()).toEqual(PATTERNS.map((p) => p.id).sort());
    expect(Object.values(PATTERN_NAMES_FA).every((name) => /[\u0600-\u06ff]/.test(name))).toBe(
      true,
    );
  });
  it('skips unrelated parent renders but refreshes selection, callback and local search', () => {
    let tree!: ReturnType<typeof create>;
    const onSelect = vi.fn();
    act(() => {
      tree = create(createElement(PatternLibrary, { selectedId: 'dot-grid', onSelect }));
    });
    const firstProps = tree.root.findByType('fieldset').props;
    act(() => tree.update(createElement(PatternLibrary, { selectedId: 'dot-grid', onSelect })));
    expect(tree.root.findByType('fieldset').props).toBe(firstProps);
    act(() => tree.update(createElement(PatternLibrary, { selectedId: 'grid', onSelect })));
    expect(
      tree.root.findAllByProps({ type: 'radio' }).find((input) => input.props.checked)?.props.value,
    ).toBe('grid');
    const replacement = vi.fn();
    act(() =>
      tree.update(createElement(PatternLibrary, { selectedId: 'grid', onSelect: replacement })),
    );
    act(() => tree.root.findAllByProps({ type: 'radio' })[0]!.props.onChange());
    expect(replacement).toHaveBeenCalledWith('dot-grid');
    expect(onSelect).not.toHaveBeenCalled();
    act(() =>
      tree.root
        .findByProps({ type: 'search' })
        .props.onChange({ currentTarget: { value: 'kumiko' } }),
    );
    expect(tree.root.findAllByProps({ type: 'radio' })).toHaveLength(1);
    expect(tree.root.findByProps({ type: 'radio' }).props.value).toBe('kumiko');
    act(() => tree.unmount());
  });
  it('is deterministic and does not mutate pattern defaults', () => {
    const before = PATTERNS.map((p) => JSON.stringify(p.defaults));
    const render = () =>
      renderToStaticMarkup(
        createElement(PatternLibrary, { selectedId: 'grid', onSelect: () => {} }),
      );
    expect(render()).toBe(render());
    expect(PATTERNS.map((p) => JSON.stringify(p.defaults))).toEqual(before);
  });
});
