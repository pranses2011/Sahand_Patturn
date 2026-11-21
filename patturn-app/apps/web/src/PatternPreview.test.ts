import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PatternViewSwitch, FlatPatternPreview, type PatternView } from './PatternPreview';

describe('Flat/surface pattern previews',()=>{
  it.each(['flat','surface'] as PatternView[])('selects only %s without hiding the geometry limitation',(value)=>{
    const html=renderToStaticMarkup(createElement(PatternViewSwitch,{value,onChange:()=>{}}));
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toContain(`value="${value}"`);
    expect(html).toContain('برجستگی یا برش هندسی روی STL ایجاد نمی‌کند');
    expect(html).toContain('<legend>نمای الگو</legend>');
  });
  it('renders a bounded and labelled flat canvas with the configured stroke and fill',()=>{
    const html=renderToStaticMarkup(createElement(FlatPatternPreview,{paths:[{d:'M0 0L10 10'},{d:'M1 1L2 2z',fill:true}],strokeMm:3}));
    expect(html).toContain('viewBox="0 0 300 300"');expect(html).toContain('overflow="hidden"');
    expect(html).toContain('role="img"');expect(html).toContain('stroke-width="3"');
    expect(html).toContain('fill="#1c1917"');expect(html).not.toContain('<canvas');
  });
});
