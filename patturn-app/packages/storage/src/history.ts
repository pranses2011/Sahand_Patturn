import { EditorState, type EditorState as State } from '@patturn/schema';

export const EDITOR_HISTORY_KEY = 'patturn:editor-history:v1';
export const HISTORY_LIMIT = 10;
export interface HistoryEntry {
  id: string;
  savedAt: string;
  state: State;
}
export interface HistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** One atomic localStorage write contains current state and its bounded history. */
export class EditorHistory {
  constructor(
    private storage: HistoryStorage,
    private patterns: readonly string[],
  ) {}
  private state(input: unknown): State {
    const state = EditorState.parse(input);
    if (!this.patterns.includes(state.patternId)) throw new Error('HISTORY_UNKNOWN_PATTERN');
    return state;
  }
  list(): HistoryEntry[] {
    const raw = this.storage.getItem(EDITOR_HISTORY_KEY);
    if (raw === null) {
      // Migrate the original editor autosave on first successful write; never delete it.
      const old = this.storage.getItem('patturn:last');
      if (!old) return [];
      if (old.length > 256 * 1024) throw new Error('HISTORY_TOO_LARGE');
      const { at, ...state } = JSON.parse(old);
      if (!Number.isFinite(at)) throw new Error('HISTORY_INVALID_LEGACY_DATE');
      return [{ id: 'legacy', savedAt: new Date(at).toISOString(), state: this.state(state) }];
    }
    if (raw.length > 256 * 1024) throw new Error('HISTORY_TOO_LARGE');
    const document = JSON.parse(raw);
    if (
      document?.version !== 1 ||
      !Array.isArray(document.entries) ||
      document.entries.length > HISTORY_LIMIT
    )
      throw new Error('HISTORY_INVALID_FORMAT');
    const ids = new Set<string>();
    return document.entries.map((entry: HistoryEntry) => {
      if (
        !entry ||
        typeof entry.id !== 'string' ||
        !entry.id ||
        ids.has(entry.id) ||
        typeof entry.savedAt !== 'string' ||
        !Number.isFinite(Date.parse(entry.savedAt))
      )
        throw new Error('HISTORY_INVALID_ENTRY');
      ids.add(entry.id);
      return { id: entry.id, savedAt: entry.savedAt, state: this.state(entry.state) };
    });
  }
  save(input: State, now = new Date()): HistoryEntry[] {
    const state = this.state(input);
    const previous = this.list(); // do not overwrite corrupted existing data
    if (previous[0] && JSON.stringify(previous[0].state) === JSON.stringify(state)) return previous;
    const entry: HistoryEntry = { id: crypto.randomUUID(), savedAt: now.toISOString(), state };
    const entries = [entry, ...previous].slice(0, HISTORY_LIMIT);
    this.storage.setItem(EDITOR_HISTORY_KEY, JSON.stringify({ version: 1, entries }));
    return entries;
  }
  restore(id: string): State {
    const entry = this.list().find((entry) => entry.id === id);
    if (!entry) throw new Error('HISTORY_NOT_FOUND');
    // The UI autosaves this restored state as a NEW entry, preserving newer versions.
    return entry.state;
  }
}
