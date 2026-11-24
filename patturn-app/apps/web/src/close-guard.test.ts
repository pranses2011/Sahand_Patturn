import { expect, it, vi } from 'vitest';
import { installCloseGuard, type CloseGuardDriver } from './close-guard';
function setup(confirm: () => Promise<boolean> = async () => false) {
  let handler!: Parameters<CloseGuardDriver['subscribe']>[0];
  const stop = vi.fn(),
    failed = vi.fn();
  let dirty = true;
  const dispose = installCloseGuard(
    {
      subscribe: async (callback) => {
        handler = callback;
        return stop;
      },
      confirm,
    },
    () => dirty,
    failed,
  );
  const close = async () => {
    const event = { preventDefault: vi.fn() };
    await handler(event);
    return event;
  };
  return {
    close,
    dispose,
    stop,
    failed,
    clean: () => {
      dirty = false;
    },
  };
}
it('permits clean closure without asking and prevents dirty cancellation', async () => {
  const confirm = vi.fn(async () => false);
  const state = setup(confirm);
  expect((await state.close()).preventDefault).toHaveBeenCalledOnce();
  state.clean();
  expect((await state.close()).preventDefault).not.toHaveBeenCalled();
  expect(confirm).toHaveBeenCalledOnce();
  state.dispose();
});
it('permits explicitly accepted closure without writing or claiming to flush', async () => {
  const state = setup(async () => true);
  expect((await state.close()).preventDefault).not.toHaveBeenCalled();
  state.dispose();
});
it('prevents closure on confirmation failure', async () => {
  const state = setup(async () => {
    throw Error('dialog');
  });
  expect((await state.close()).preventDefault).toHaveBeenCalledOnce();
  expect(state.failed).toHaveBeenCalledOnce();
  state.dispose();
});
it('coalesces simultaneous close requests and prevents obsolete confirmation after cleanup', async () => {
  let release = (value: boolean) => {};
  const gate = new Promise<boolean>((resolve) => {
    release = resolve;
  });
  const confirm = vi.fn(() => gate);
  const state = setup(confirm);
  const first = state.close();
  expect((await state.close()).preventDefault).toHaveBeenCalledOnce();
  expect(confirm).toHaveBeenCalledOnce();
  state.dispose();
  release(true);
  expect((await first).preventDefault).toHaveBeenCalledOnce();
});
it('unsubscribes registration that finishes after disposal', async () => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const stop = vi.fn();
  const dispose = installCloseGuard(
    {
      subscribe: async () => {
        await gate;
        return stop;
      },
      confirm: async () => true,
    },
    () => true,
    vi.fn(),
  );
  dispose();
  release();
  await gate;
  await Promise.resolve();
  expect(stop).toHaveBeenCalledOnce();
});
it('reports subscription failure without an unhandled rejection', async () => {
  const failed = vi.fn();
  installCloseGuard(
    {
      subscribe: async () => {
        throw Error('listen');
      },
      confirm: async () => true,
    },
    () => true,
    failed,
  );
  await Promise.resolve();
  await Promise.resolve();
  expect(failed).toHaveBeenCalledOnce();
});

it('removes a registered listener exactly once on repeated cleanup', async () => {
  const state = setup();
  await Promise.resolve();
  state.dispose();
  state.dispose();
  expect(state.stop).toHaveBeenCalledOnce();
});
it('grants the explicit destroy permission required by the native onCloseRequested adapter', async () => {
  const { readFile } = await import('node:fs/promises');
  const capability = JSON.parse(
    await readFile(
      new URL('../../../apps/desktop/src-tauri/capabilities/default.json', import.meta.url),
      'utf8',
    ),
  );
  expect(capability.windows).toEqual(['main']);
  expect(capability.permissions).toContain('core:window:allow-destroy');
});
