import { act, create } from 'react-test-renderer';
import { createElement } from 'react';
import { it, expect, vi } from 'vitest';
import { DeferredTool } from './DeferredTool';
it('does not import until expanded, reuses the module on collapse and passes current props', async () => {
  const Child = ({ value }: { value: number }) => createElement('p', null, value);
  const load = vi.fn().mockResolvedValue({ default: Child });
  let tree!: ReturnType<typeof create>;
  const view = (value: number) =>
    createElement(DeferredTool, { label: 'ابزار', className: 'tool', load, toolProps: { value } });
  act(() => {
    tree = create(view(1));
  });
  expect(load).not.toHaveBeenCalled();
  await act(async () => {
    tree.root.findByType('details').props.onToggle({ currentTarget: { open: true } });
  });
  expect(load).toHaveBeenCalledTimes(1);
  expect(tree.root.findByType('p').children).toEqual(['1']);
  await act(async () => {
    tree.root.findByType('details').props.onToggle({ currentTarget: { open: false } });
    tree.update(view(2));
  });
  expect(load).toHaveBeenCalledTimes(1);
  expect(tree.root.findByType('p').children).toEqual(['2']);
  act(() => tree.unmount());
});
it('contains import rejection and allows an explicit retry of the loader', async () => {
  const load = vi
    .fn()
    .mockRejectedValueOnce(Error('offline'))
    .mockResolvedValueOnce({ default: () => createElement('p', null, 'ready') });
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      createElement(DeferredTool, { label: 'ابزار', className: 'tool', load, toolProps: {} }),
    );
  });
  await act(async () => {
    tree.root.findByType('details').props.onToggle({ currentTarget: { open: true } });
  });
  expect(tree.root.findByProps({ role: 'alert' })).toBeDefined();
  await act(async () => {
    tree.root.findByType('button').props.onClick();
  });
  expect(load).toHaveBeenCalledTimes(2);
  expect(tree.root.findByType('p').children).toEqual(['ready']);
  act(() => tree.unmount());
});
it('ignores a module that resolves after the wrapper is unmounted', async () => {
  let resolve!: (module: { default: () => null }) => void;
  const load = vi.fn(
    () =>
      new Promise<{ default: () => null }>((done) => {
        resolve = done;
      }),
  );
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      createElement(DeferredTool, { label: 'ابزار', className: 'tool', load, toolProps: {} }),
    );
  });
  await act(async () => {
    tree.root.findByType('details').props.onToggle({ currentTarget: { open: true } });
  });
  act(() => tree.unmount());
  await act(async () => {
    resolve({ default: () => null });
  });
  expect(load).toHaveBeenCalledTimes(1);
});
