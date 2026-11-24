import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ desktop: vi.fn(), factory: vi.fn() }));
vi.mock('@patturn/storage', () => ({
  isDesktop: mocks.desktop,
  desktopSqliteHistory: mocks.factory,
}));
vi.mock('./App', () => ({
  App: ({ historySession }: { historySession?: unknown }) =>
    createElement('div', { 'data-session': !!historySession }),
}));
import { EditorBoot } from './EditorBoot';
beforeEach(() => {
  vi.clearAllMocks();
});
it('keeps the browser path synchronous without loading a database', () => {
  mocks.desktop.mockReturnValue(false);
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(createElement(EditorBoot));
  });
  expect(tree.root.findByType('div').props['data-session']).toBe(false);
  expect(mocks.factory).not.toHaveBeenCalled();
  act(() => tree.unmount());
});
it('waits for migration before mounting the autosaving desktop editor', async () => {
  mocks.desktop.mockReturnValue(true);
  let resolve!: (value: unknown[]) => void;
  const importLegacy = vi.fn(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  mocks.factory.mockResolvedValue({ importLegacy });
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(createElement(EditorBoot));
  });
  expect(tree.root.findByProps({ role: 'status' })).toBeDefined();
  await act(async () => resolve([]));
  expect(tree.root.findByType('div').props['data-session']).toBe(true);
  act(() => tree.unmount());
});
it('fails closed without mounting App and allows an explicit startup retry', async () => {
  mocks.desktop.mockReturnValue(true);
  mocks.factory
    .mockRejectedValueOnce(Error('disk locked'))
    .mockResolvedValue({ importLegacy: async () => [] });
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(createElement(EditorBoot));
  });
  expect(tree.root.findByProps({ role: 'alert' })).toBeDefined();
  expect(tree.root.findAllByProps({ 'data-session': true })).toHaveLength(0);
  await act(async () => tree.root.findByType('button').props.onClick());
  expect(tree.root.findByType('div').props['data-session']).toBe(true);
  act(() => tree.unmount());
});
it('ignores late migration completion after unmount', async () => {
  mocks.desktop.mockReturnValue(true);
  let resolve!: (value: unknown[]) => void;
  mocks.factory.mockResolvedValue({
    importLegacy: () =>
      new Promise((done) => {
        resolve = done;
      }),
  });
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(createElement(EditorBoot));
  });
  act(() => tree.unmount());
  await act(async () => resolve([]));
  expect(tree.toJSON()).toBeNull();
});
