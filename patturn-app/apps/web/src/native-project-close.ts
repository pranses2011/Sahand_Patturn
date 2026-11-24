import { installCloseGuard } from './close-guard';
import { projectClose as text } from './messages/fa.json';
/** Desktop-only adapter. Native close is confirmed, never advertised as an exit flush. */
export function nativeProjectCloseGuard(
  shouldWarn: () => boolean,
  onError: () => void,
  onReady: () => void = () => {},
) {
  let confirm: (() => Promise<boolean>) | null = null;
  return installCloseGuard(
    {
      subscribe: async (handler) => {
        const [windows, dialog] = await Promise.all([
          import('@tauri-apps/api/window'),
          import('@tauri-apps/plugin-dialog'),
        ]);
        confirm = () =>
          dialog.confirm(text.warning, {
            title: text.title,
            kind: 'warning',
            okLabel: text.quit,
            cancelLabel: text.stay,
          });
        const unlisten = await windows.getCurrentWindow().onCloseRequested(handler);
        return () => {
          void Promise.resolve(unlisten()).catch(onError);
        };
      },
      confirm: () => {
        if (!confirm) return Promise.reject(Error('CLOSE_GUARD_NOT_READY'));
        return confirm();
      },
    },
    shouldWarn,
    onError,
    onReady,
  );
}
