export interface CloseGuardDriver {
  subscribe(handler: (event: { preventDefault(): void }) => Promise<void>): Promise<() => void>;
  confirm(): Promise<boolean>;
}
/** Async registration cleanup and confirmation are independent of the native transport. */
export function installCloseGuard(
  driver: CloseGuardDriver,
  shouldWarn: () => boolean,
  onError: () => void,
): () => void {
  let active = true,
    asking = false;
  let unlisten: (() => void) | null = null;
  void driver
    .subscribe(async (event) => {
      if (!active) {
        event.preventDefault();
        return;
      }
      if (!shouldWarn()) return;
      if (asking) {
        event.preventDefault();
        return;
      }
      asking = true;
      try {
        const accepted = await driver.confirm();
        if (!active || !accepted) event.preventDefault();
      } catch {
        event.preventDefault();
        if (active) onError();
      } finally {
        asking = false;
      }
    })
    .then((stop) => {
      if (active) unlisten = stop;
      else stop();
    })
    .catch(() => {
      if (active) onError();
    });
  return () => {
    active = false;
    unlisten?.();
    unlisten = null;
  };
}
