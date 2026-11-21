import { PATTERN_NAMES_FA } from '@patturn/config';
import { EditorState, type EditorState as State } from '@patturn/schema';

const LABELS: Record<keyof State, string> = {
  profileMode: 'فرم', segments: 'تقسیمات مش', wall: 'ضخامت', shrink: 'انقباض',
  fill: 'پرشدگی', patternId: 'الگو', tileSize: 'اندازهٔ کاشی',
};
const PROFILE_NAMES: Record<State['profileMode'], string> = {
  reference: 'گلدان مرجع', bucket: 'سطل گشاد', vase: 'گلدان کمر باریک',
};
const value = (key: keyof State, v: string | number) => key === 'profileMode'
  ? PROFILE_NAMES[v as State['profileMode']]
  : key === 'patternId' ? PATTERN_NAMES_FA[String(v)] ?? v
  : typeof v === 'number' ? new Intl.NumberFormat('fa-IR').format(v) : v;

/** In-memory editing history; unrelated to autosave and folder backups. */
export class ParameterHistory {
  private entries: { state: State; title: string }[];
  private cursor = 0;
  private grouping = false;
  private groupHasEntry = false;
  private groupStart: { entries: { state: State; title: string }[]; cursor: number } | null = null;
  constructor(initial: State, private limit = 50) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('INVALID_HISTORY_LIMIT');
    this.entries = [{ state: EditorState.parse(initial), title: 'شروع' }];
  }
  get canUndo() { return this.cursor > 0; }
  get canRedo() { return this.cursor < this.entries.length - 1; }
  get undoTitle() { return this.canUndo ? this.entries[this.cursor]!.title : null; }
  get redoTitle() { return this.canRedo ? this.entries[this.cursor + 1]!.title : null; }
  get current() { return EditorState.parse(this.entries[this.cursor]!.state); }
  beginGroup() {
    if (this.grouping) return;
    this.groupStart = { entries: this.entries, cursor: this.cursor };
    this.grouping = true; this.groupHasEntry = false;
  }
  endGroup() {
    if (this.grouping && this.groupHasEntry && this.groupStart) {
      const previous = this.groupStart.entries[this.groupStart.cursor]!.state;
      const current = this.entries[this.cursor]!.state;
      if ((Object.keys(LABELS) as (keyof State)[]).every((key) => previous[key] === current[key])) {
        // Restore redo and any oldest entry displaced by the temporary edit at capacity.
        this.entries = this.groupStart.entries;
        this.cursor = this.groupStart.cursor;
      }
    }
    this.groupStart = null;
    this.grouping = false; this.groupHasEntry = false;
  }

  record(input: State): boolean {
    const state = EditorState.parse(input);
    const current = this.entries[this.cursor]!.state;
    const changed = (Object.keys(LABELS) as (keyof State)[]).filter((key) => state[key] !== current[key]);
    if (!changed.length) return false;
    const baseline = this.grouping && this.groupHasEntry ? this.groupStart!.entries[this.groupStart!.cursor]!.state : current;
    const title = (Object.keys(LABELS) as (keyof State)[]).filter((key) => state[key] !== baseline[key])
      .map((key) => `${LABELS[key]}: ${value(key, baseline[key])} ← ${value(key, state[key])}`).join(' · ') || 'تغییر پارامترها';
    if (this.grouping && this.groupHasEntry) this.entries[this.cursor] = { state, title };
    else {
      this.entries = this.entries.slice(0, this.cursor + 1);
      this.entries.push({ state, title });
      if (this.entries.length > this.limit + 1) this.entries.shift();
      this.cursor = this.entries.length - 1;
      this.groupHasEntry = this.grouping;
    }
    return true;
  }
  undo(): State | null { this.endGroup(); return this.canUndo ? (this.cursor--, this.current) : null; }
  redo(): State | null { this.endGroup(); return this.canRedo ? (this.cursor++, this.current) : null; }
}
