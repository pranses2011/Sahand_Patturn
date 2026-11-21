import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PatternViewSwitch, FlatPatternPreview, type PatternView } from './PatternPreview';

describe('Flat/surface pattern previews', () => {
  it.each(['flat', 'surface'] as PatternView[])(
    'selects only %s without hiding the geometry limitation',
    (value) => {
      const html = renderToStaticMarkup(
        createElement(PatternViewSwitch, { value, onChange: () => {} }),
      );
      expect(html.match(/checked=""/g)).toHaveLength(1);
      expect(html).toContain(`value="${value}"`);
      expect(html).toContain('برجستگی یا برش هندسی روی STL ایجاد نمی‌کند');
      expect(html).toContain('<legend>نمای الگو</legend>');
    },
  );
  it('reuses an unchanged flat SVG but updates changed stroke and path inputs', () => {
    let tree!: ReturnType<typeof create>;
    const paths = [{ d: 'M0 0L10 10' }];
    act(() => {
      tree = create(createElement(FlatPatternPreview, { paths, strokeMm: 2 }));
    });
    const initial = tree.root.findByType('svg').props;
    act(() => tree.update(createElement(FlatPatternPreview, { paths, strokeMm: 2 })));
    expect(tree.root.findByType('svg').props).toBe(initial);
    act(() => tree.update(createElement(FlatPatternPreview, { paths, strokeMm: 3 })));
    expect(tree.root.findByType('path').props.strokeWidth).toBe(3);
    const nextPaths = [{ d: 'M1 1L2 2z', fill: true }, { d: 'M3 3L4 4' }];
    act(() => tree.update(createElement(FlatPatternPreview, { paths: nextPaths, strokeMm: 3 })));
    const rendered = tree.root.findAllByType('path');
    expect(rendered).toHaveLength(2);
    expect(rendered[0]!.props.d).toBe(nextPaths[0]!.d);
    expect(rendered[0]!.props.fill).toBe('#1c1917');
    expect(rendered[1]!.props.strokeWidth).toBe(3);
    act(() => tree.unmount());
  });
  it('renders a bounded and labelled flat canvas with the configured stroke and fill', () => {
    const html = renderToStaticMarkup(
      createElement(FlatPatternPreview, {
        paths: [{ d: 'M0 0L10 10' }, { d: 'M1 1L2 2z', fill: true }],
        strokeMm: 3,
      }),
    );
    expect(html).toContain('viewBox="0 0 300 300"');
    expect(html).toContain('overflow="hidden"');
    expect(html).toContain('role="img"');
    expect(html).toContain('stroke-width="3"');
    expect(html).toContain('fill="#1c1917"');
    expect(html).not.toContain('<canvas');
  });
});
