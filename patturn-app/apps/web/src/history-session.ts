import type { EditorState } from '@patturn/schema';
import type { HistoryEntry } from '@patturn/storage';
export interface AsyncEditorHistory {
  list(): Promise<HistoryEntry[]>;
  save(state: EditorState): Promise<HistoryEntry[]>;
  restore(id: string): Promise<EditorState>;
}
export interface HistorySession {
  history: AsyncEditorHistory;
  entries: HistoryEntry[];
}
