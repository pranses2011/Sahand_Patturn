import { describe, it, expect } from 'vitest';
import { EditorHistory, EDITOR_HISTORY_KEY, HISTORY_LIMIT, type HistoryStorage } from './index.js';
import type { EditorState } from '@patturn/schema';
const state: EditorState = { profileMode: 'reference', segments: 96, wall: 4, shrink: 12, fill: 80, patternId: 'dot-grid', tileSize: 40 };
function setup() {
  const data = new Map<string, string>();
  const storage: HistoryStorage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
  return { data, storage, repo: new EditorHistory(storage, ['dot-grid']) };
}

describe('Editor autosave history', () => {
  it('H1: persists and reloads current state and deduplicates unchanged autosaves', () => {
    const { storage, repo } = setup();
    const a = repo.save(state);
    expect(a).toHaveLength(1);
    expect(repo.save(state)).toEqual(a);
    expect(new EditorHistory(storage, ['dot-grid']).list()[0]!.state).toEqual(state);
  });
  it('H2: bounded history and restore preserve later versions', () => {
    const { repo } = setup();
    for (let fill = 0; fill < 15; fill++) repo.save({ ...state, fill });
    const entries = repo.list();
    expect(entries).toHaveLength(HISTORY_LIMIT);
    expect(entries[0]!.state.fill).toBe(14);
    const restored = repo.restore(entries[5]!.id);
    expect(repo.list()).toEqual(entries);
    const next = repo.save(restored);
    expect(next[0]!.state.fill).toBe(9);
    expect(next[1]!.state.fill).toBe(14);
  });
  it('H3: migrates original autosave without deleting the source', () => {
    const { data, repo } = setup();
    const legacy = JSON.stringify({ ...state, at: 1000 });
    data.set('patturn:last', legacy);
    expect(repo.list()[0]!.state).toEqual(state);
    repo.save({ ...state, fill: 50 });
    expect(data.get('patturn:last')).toBe(legacy);
    expect(repo.list()).toHaveLength(2);
  });
  it('H4: corruption, future format and unknown patterns never get overwritten', () => {
    const { data, repo } = setup();
    for (const raw of ['broken', '{"version":2,"entries":[]}', JSON.stringify({ version: 1, entries: [{id:'x', savedAt: '2000-01-01', state: {...state, patternId:'missing'}}] })]) {
      data.set(EDITOR_HISTORY_KEY, raw);
      expect(() => repo.save(state)).toThrow();
      expect(data.get(EDITOR_HISTORY_KEY)).toBe(raw);
    }
  });
  it('H5: write failure leaves the last saved state intact; invalid inputs rejected', () => {
    const { repo, storage } = setup();
    const before = repo.save(state);
    storage.setItem = () => { throw new Error('quota'); };
    expect(() => repo.save({...state, fill: 10})).toThrow('quota');
    expect(repo.list()).toEqual(before);
    expect(() => repo.save({...state, segments: 1})).toThrow();
    expect(() => repo.restore('missing')).toThrow('HISTORY_NOT_FOUND');
  });
});
