import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { it, expect } from 'vitest';
import { FlowArrow } from './FlowArrow';
it('provides an unfocusable decorative vector rather than an extra screen-reader label', () => {
  const html = renderToStaticMarkup(createElement(FlowArrow));
  expect(html).toContain('class="flow-arrow"');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('focusable="false"');
  expect(html).not.toContain('<title');
  expect(html).not.toContain('tabindex');
});
