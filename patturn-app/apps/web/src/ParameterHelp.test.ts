import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ParameterHelp, type HelpTopic } from './ParameterHelp';

describe('Offline parameter education', () => {
  it.each(['segments', 'wall', 'shrink', 'fill', 'tile'] as HelpTopic[])(
    '%s provides native disclosure, Persian explanation and labelled inline diagram',
    (topic) => {
      const html = renderToStaticMarkup(createElement(ParameterHelp, { topic }));
      expect(html).toContain('<details');
      expect(html).toContain('<summary>راهنما:');
      expect(html).toContain('role="img"');
      const titleId = html.match(/<title id="([^"]+)"/)![1];
      expect(html).toContain(`aria-labelledby="${titleId}"`);
      expect(html).toContain('نقشهٔ ساخت نیست');
      expect(html).not.toMatch(/https?:|<img|<script/);
    },
  );
  it('explains the critical approximation and percentage meanings', () => {
    const text = (topic: HelpTopic) =>
      renderToStaticMarkup(createElement(ParameterHelp, { topic }));
    expect(text('wall')).toContain('STL فرم بیرونی توپر را توخالی نمی‌کند');
    expect(text('fill')).toContain('نه درصد حجم کل');
    expect(text('shrink')).toContain('تقسیم بر همین ضریب');
    expect(text('tile')).toContain('۱۰۰٪');
  });
});
