import { createElement, useEffect, useState } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ViewportBoundary } from './ViewportBoundary';

describe('Isolated viewport failure recovery', () => {
  it('catches preview render failure while preserving sibling editor state and allows retry', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    let broken = true;
    function Preview() {
      if (broken) throw Error('graphics failed');
      return createElement('canvas');
    }
    function Editor() {
      const [wall, setWall] = useState(4);
      return createElement(
        'main',
        null,
        createElement('button', { id: 'editor', onClick: () => setWall(8) }, String(wall)),
        createElement(ViewportBoundary, null, createElement(Preview)),
      );
    }
    try {
      let tree!: ReturnType<typeof create>;
      act(() => {
        tree = create(createElement(Editor));
      });
      expect(tree.root.findByProps({ role: 'alert' }).children.length).toBeGreaterThan(0);
      act(() => tree.root.findByProps({ id: 'editor' }).props.onClick());
      broken = false;
      act(() =>
        tree.root
          .findAllByType('button')
          .find((b) => b.props.className === 'btn')!
          .props.onClick(),
      );
      expect(tree.root.findAllByProps({ role: 'alert' })).toHaveLength(0);
      expect(tree.root.findAllByType('canvas')).toHaveLength(1);
      expect(tree.root.findByProps({ id: 'editor' }).children).toEqual(['8']);
      act(() => tree.unmount());
    } finally {
      log.mockRestore();
    }
  });
  it('catches effect initialization errors without an automatic retry loop', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const initialize = vi.fn(() => {
      throw Error('WebGL unavailable');
    });
    function Preview() {
      useEffect(() => {
        initialize();
      }, []);
      return null;
    }
    try {
      let tree!: ReturnType<typeof create>;
      act(() => {
        tree = create(createElement(ViewportBoundary, null, createElement(Preview)));
      });
      expect(initialize).toHaveBeenCalledTimes(1);
      expect(tree.root.findByProps({ role: 'alert' })).toBeTruthy();
      act(() => tree.unmount());
    } finally {
      log.mockRestore();
    }
  });
});
