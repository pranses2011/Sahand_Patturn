import { useState } from 'react';
import type { EditorMode } from './EditorMode';

export const EDITOR_MODE_KEY = 'patturn:editor-mode:v1';
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
const browserStorage = () => window.localStorage;

/** UI preference only; storage failures must never prevent editing a project. */
export function useEditorMode(storage: () => PreferenceStorage = browserStorage) {
  const [initial] = useState(() => {
    try { return { mode: storage().getItem(EDITOR_MODE_KEY) === 'pro' ? 'pro' as const : 'simple' as const, error: false }; }
    catch { return { mode: 'simple' as const, error: true }; }
  });
  const [mode, setMode] = useState<EditorMode>(initial.mode);
  const [error, setError] = useState(initial.error);
  const changeMode = (next: EditorMode) => {
    setMode(next);
    try { storage().setItem(EDITOR_MODE_KEY, next); setError(false); }
    catch { setError(true); }
  };
  return { mode, changeMode, error };
}
