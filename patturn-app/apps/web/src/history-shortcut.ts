interface ShortcutEvent {
  key: string; code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean;
  isComposing: boolean; defaultPrevented: boolean;
}

/** Prefer semantic Latin keys; fall back to physical Z/Y for Persian keyboard layouts. */
export function historyShortcut(event: ShortcutEvent): 'undo' | 'redo' | null {
  if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return null;
  const key = event.key.toLowerCase();
  const command = key === 'z' || key === 'y' ? key : event.code === 'KeyZ' ? 'z' : event.code === 'KeyY' ? 'y' : null;
  if (!command) return null;
  return command === 'y' || event.shiftKey ? 'redo' : 'undo';
}
