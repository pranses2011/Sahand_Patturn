export interface CloseGuardDriver {
  subscribe(handler: (event: { preventDefault(): void }) => Promise<void>): Promise<() => void>;
  confirm(): Promise<boolean>;
}
/** Async registration cleanup and confirmation are independent of the native transport. */
export function installCloseGuard(
  driver: CloseGuardDriver,
  shouldWarn: () => boolean,
  onError: () => void,
  onReady: () => void = () => {},
): () => void {
  let active = true,
    asking = false;
  let unlisten: (() => void) | null = null;
  const release = (stop: () => void) => {
    try {
      stop();
    } catch {
      if (active) onError();
    }
  };
  const dispose = () => {
    active = false;
    if (unlisten) release(unlisten);
    unlisten = null;
  };
  try {
    void driver
      .subscribe(async (event) => {
        if (!active || asking) {
          event.preventDefault();
          return;
        }
        try {
          if (!shouldWarn()) return;
          asking = true;
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
        if (active) {
          unlisten = stop;
          onReady();
        } else release(stop);
      })
      .catch(() => {
        if (active) onError();
      });
  } catch {
    if (active) onError();
  }
  return dispose;
}
