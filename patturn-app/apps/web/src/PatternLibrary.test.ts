import { PATTERN_NAMES_FA } from '@patturn/config';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PATTERNS } from '@patturn/patterns';
import { PatternLibrary } from './PatternLibrary';

describe('Pattern selection cards', () => {
  it.each(PATTERNS.map((p) => p.id))('renders all patterns with only %s selected', (id) => {
    const html = renderToStaticMarkup(createElement(PatternLibrary, { selectedId: id, onSelect: () => {} }));
    expect(html.match(/type="radio"/g)).toHaveLength(PATTERNS.length);
    expect(html.match(/<svg/g)).toHaveLength(PATTERNS.length);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toContain(`value="${id}"`);
    expect(html).toContain('اندازهٔ واقعی پروژه');
    expect(html).not.toMatch(/https?:|<img|<script/);
    expect(html).toContain('شبکهٔ نقطه‌ای');
  });
  it('has one Persian display name for every built-in pattern and no stale names',()=>{
    expect(Object.keys(PATTERN_NAMES_FA).sort()).toEqual(PATTERNS.map((p)=>p.id).sort());
    expect(Object.values(PATTERN_NAMES_FA).every((name)=>/[\u0600-\u06ff]/.test(name))).toBe(true);
  });
  it('is deterministic and does not mutate pattern defaults', () => {
    const before = PATTERNS.map((p) => JSON.stringify(p.defaults));
    const render = () => renderToStaticMarkup(createElement(PatternLibrary, { selectedId: 'grid', onSelect: () => {} }));
    expect(render()).toBe(render());
    expect(PATTERNS.map((p) => JSON.stringify(p.defaults))).toEqual(before);
  });
});
