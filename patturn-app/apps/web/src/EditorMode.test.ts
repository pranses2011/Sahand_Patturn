import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdvancedControls, EditorModeSwitch } from './EditorMode';

describe('Editor control disclosure', () => {
  it('simple mode leaves advanced values mounted inside a closed disclosure', () => {
    const html = renderToStaticMarkup(createElement(AdvancedControls, { mode: 'simple',
      children: createElement('input', { type: 'number', defaultValue: 124 }) }));
    expect(html).toContain('<details');
    expect(html).not.toContain(' open=');
    expect(html).toContain('value="124"');
    expect(html).toContain('مقادیر فعلی حفظ می‌شوند');
  });
  it('pro mode exposes the same values without a disclosure', () => {
    const html = renderToStaticMarkup(createElement(AdvancedControls, { mode: 'pro',
      children: createElement('input', { type: 'number', defaultValue: 124 }) }));
    expect(html).not.toContain('<details');
    expect(html).toContain('value="124"');
    expect(html).toContain('aria-label="کنترل‌های پیشرفته"');
  });
  it.each(['simple', 'pro'] as const)('mode %s has a single selected, labelled native radio', (mode) => {
    const html = renderToStaticMarkup(createElement(EditorModeSwitch, { mode, onChange: () => {} }));
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`value="${mode}"`));
    expect(html).toContain('<legend>سطح کنترل‌ها</legend>');
    expect(html).toContain('تنظیمات و خروجی پروژه دست‌نخورده می‌مانند');
  });
});
