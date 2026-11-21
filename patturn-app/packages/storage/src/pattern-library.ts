import { z } from 'zod';
import { EditorState } from '@patturn/schema';
import type { HistoryStorage } from './history.js';

export const MAX_PATTERN_BACKUP_BYTES = 64 * 1024;
export const PATTERN_LIBRARY_KEY = 'patturn:pattern-library:v1';
const Recipe = EditorState.pick({ patternId: true, tileSize: true }).extend({
  name: z.string().trim().min(1).max(60),
}).strict();
export type PatternRecipe = z.infer<typeof Recipe>;
const Document = z.object({ version: z.literal(1), entries: z.array(Recipe).max(30) }).strict();

const Backup = Document.extend({ format: z.literal('patturn-pattern-library') }).strict();

/** Named local recipes, not arbitrary SVG or executable pattern definitions. */
export class PatternLibraryRepo {
  constructor(private storage: HistoryStorage, private patternIds: readonly string[]) {}
  private validate(input: unknown): PatternRecipe {
    const recipe = Recipe.parse(input);
    if (!this.patternIds.includes(recipe.patternId)) throw new Error('LIBRARY_UNKNOWN_PATTERN');
    return recipe;
  }
  list(): PatternRecipe[] {
    const raw = this.storage.getItem(PATTERN_LIBRARY_KEY);
    if (raw === null) return [];
    if (raw.length > 32 * 1024) throw new Error('LIBRARY_TOO_LARGE');
    const entries = Document.parse(JSON.parse(raw)).entries.map((e) => this.validate(e));
    if (new Set(entries.map((e) => e.name)).size !== entries.length) throw new Error('LIBRARY_DUPLICATE_NAME');
    return entries;
  }
  private mergeBackup(bytes: Uint8Array) {
    if (bytes.byteLength > MAX_PATTERN_BACKUP_BYTES) throw new Error('LIBRARY_BACKUP_TOO_LARGE');
    const backup = Backup.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    const incoming = backup.entries.map((entry) => this.validate(entry));
    if (new Set(incoming.map((entry) => entry.name)).size !== incoming.length) throw new Error('LIBRARY_DUPLICATE_NAME');
    const current = this.list(), merged = [...current];
    for (const entry of incoming) {
      const existing = current.find((item) => item.name === entry.name);
      if (existing) {
        if (existing.patternId !== entry.patternId || existing.tileSize !== entry.tileSize) throw new Error('LIBRARY_IMPORT_CONFLICT');
      } else merged.push(entry);
    }
    if (merged.length > 30) throw new Error('LIBRARY_FULL');
    return { merged, added: merged.length - current.length };
  }
  previewImport(bytes: Uint8Array): { added: number; total: number } {
    const { merged, added } = this.mergeBackup(bytes);
    return { added, total: merged.length };
  }
  importDocument(bytes: Uint8Array): PatternRecipe[] {
    // Re-read and revalidate on commit; preview is never authority for later storage.
    const { merged, added } = this.mergeBackup(bytes);
    if (added) this.storage.setItem(PATTERN_LIBRARY_KEY, JSON.stringify({ version: 1, entries: merged }));
    return merged;
  }
  exportDocument(): Uint8Array {
    // Validate stored data; never export a corrupt library as a successful backup.
    return new TextEncoder().encode(JSON.stringify({
      format: 'patturn-pattern-library', version: 1, entries: this.list(),
    }, null, 2));
  }
  save(input: PatternRecipe): PatternRecipe[] {
    const recipe = this.validate(input), entries = this.list();
    if (entries.some((e) => e.name === recipe.name)) throw new Error('LIBRARY_NAME_EXISTS');
    if (entries.length >= 30) throw new Error('LIBRARY_FULL');
    const next = [...entries, recipe];
    this.storage.setItem(PATTERN_LIBRARY_KEY, JSON.stringify({ version: 1, entries: next }));
    return next;
  }
  update(name: string, input: Pick<PatternRecipe, 'patternId' | 'tileSize'>): PatternRecipe[] {
    const entries = this.list();
    const index = entries.findIndex((entry) => entry.name === name);
    if (index < 0) throw new Error('LIBRARY_NOT_FOUND');
    const recipe = this.validate({ ...input, name });
    const current = entries[index]!;
    if (current.patternId === recipe.patternId && current.tileSize === recipe.tileSize) return entries;
    const next = entries.map((entry, i) => i === index ? recipe : entry);
    this.storage.setItem(PATTERN_LIBRARY_KEY, JSON.stringify({ version: 1, entries: next }));
    return next;
  }
  rename(name: string, nextName: string): PatternRecipe[] {
    const entries = this.list();
    const index = entries.findIndex((entry) => entry.name === name);
    if (index < 0) throw new Error('LIBRARY_NOT_FOUND');
    const recipe = this.validate({ ...entries[index]!, name: nextName });
    if (entries.some((entry, i) => i !== index && entry.name === recipe.name)) throw new Error('LIBRARY_NAME_EXISTS');
    if (recipe.name === entries[index]!.name) return entries;
    const next = entries.map((entry, i) => i === index ? recipe : entry);
    this.storage.setItem(PATTERN_LIBRARY_KEY, JSON.stringify({ version: 1, entries: next }));
    return next;
  }
  delete(name: string): PatternRecipe[] {
    const next = this.list().filter((e) => e.name !== name);
    this.storage.setItem(PATTERN_LIBRARY_KEY, JSON.stringify({ version: 1, entries: next }));
    return next;
  }
}
