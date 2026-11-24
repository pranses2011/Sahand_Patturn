import { and, eq } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { EditorState, type EditorState as State } from '@patturn/schema';
import { EDITOR_HISTORY_KEY, EditorHistory, type HistoryEntry } from './history.js';

/** Drivers must bind parameters, not interpolate them. Rows are named, never order-dependent. */
export interface SqliteHistoryDriver {
  execute(query: string, parameters: unknown[]): Promise<void>;
  select(query: string, parameters: unknown[]): Promise<Record<string, unknown>[]>;
}
const historyTable = sqliteTable('patturn_editor_history', {
  slot: text('slot').primaryKey(),
  version: integer('version').notNull(),
  revision: integer('revision').notNull(),
  document: text('document').notNull(),
});
const INITIAL_SCHEMA = `CREATE TABLE IF NOT EXISTS patturn_editor_history (
  slot TEXT PRIMARY KEY NOT NULL CHECK(slot = 'editor'),
  version INTEGER NOT NULL CHECK(version = 1),
  revision INTEGER NOT NULL CHECK(revision > 0 AND revision <= 9007199254740991),
  document TEXT NOT NULL CHECK(length(document) <= 262144)
)`;

/** Atomic single-statement compare-and-swap; no transaction spanning pooled connections.
 * A conflicting writer fails visibly instead of silently losing history.
 */
export class SqliteEditorHistory {
  private db;
  private ready: Promise<void> | null = null;
  constructor(
    private driver: SqliteHistoryDriver,
    private patterns: readonly string[],
  ) {
    this.db = drizzle(async (query, parameters, method) => {
      if (method === 'run') {
        await this.driver.execute(query, parameters);
        return { rows: [] };
      }
      // Every internal select/returning uses the complete table projection in schema order.
      const rows = await this.driver.select(query, parameters);
      return { rows: rows.map((row) => [row.slot, row.version, row.revision, row.document]) };
    });
  }
  private init() {
    if (!this.ready)
      this.ready = this.driver.execute(INITIAL_SCHEMA, []).catch((error) => {
        this.ready = null;
        throw error;
      });
    return this.ready;
  }
  private async read() {
    await this.init();
    const rows = await this.db
      .select()
      .from(historyTable)
      .all()
      .catch((error) => {
        throw new Error('SQLITE_HISTORY_READ_FAILED', { cause: error });
      });
    if (rows.length > 1) throw Error('SQLITE_HISTORY_INVALID_ROW');
    const row = rows[0];
    if (
      row &&
      (row.slot !== 'editor' ||
        row.version !== 1 ||
        !Number.isSafeInteger(row.revision) ||
        row.revision < 1 ||
        typeof row.document !== 'string' ||
        row.document.length > 256 * 1024)
    )
      throw Error('SQLITE_HISTORY_INVALID_ROW');
    return row;
  }
  private history(document: string | null, write?: (value: string) => void) {
    return new EditorHistory(
      {
        getItem: (key) => (key === EDITOR_HISTORY_KEY ? document : null),
        setItem: (_key, value) => {
          if (!write) throw Error('SQLITE_HISTORY_READ_ONLY');
          write(value);
        },
      },
      this.patterns,
    );
  }
  async list(): Promise<HistoryEntry[]> {
    const row = await this.read();
    return this.history(row?.document ?? null).list();
  }
  async restore(id: string): Promise<State> {
    const row = await this.read();
    return this.history(row?.document ?? null).restore(id);
  }
  async save(input: State, now = new Date()): Promise<HistoryEntry[]> {
    // Snapshot state/time before any driver await; validation does not mutate callers.
    const state = EditorState.parse(input);
    if (!this.patterns.includes(state.patternId)) throw Error('HISTORY_UNKNOWN_PATTERN');
    const timestamp = new Date(now.getTime());
    if (!Number.isFinite(timestamp.getTime())) throw Error('SQLITE_HISTORY_INVALID_DATE');
    const row = await this.read();
    let document: string | null = null;
    const entries = this.history(row?.document ?? null, (value) => {
      document = value;
    }).save(state, timestamp);
    if (document === null) return entries; // unchanged: no revision or timestamp churn
    if (row?.revision === Number.MAX_SAFE_INTEGER) throw Error('SQLITE_HISTORY_REVISION_LIMIT');
    const values = { slot: 'editor', version: 1, revision: (row?.revision ?? 0) + 1, document };
    const committed = row
      ? await this.db
          .update(historyTable)
          .set(values)
          .where(
            and(
              eq(historyTable.slot, 'editor'),
              eq(historyTable.revision, row.revision),
              eq(historyTable.version, 1),
            ),
          )
          .returning()
          .all()
          .catch((error) => {
            throw new Error('SQLITE_HISTORY_WRITE_FAILED', { cause: error });
          })
      : await this.db
          .insert(historyTable)
          .values(values)
          .onConflictDoNothing()
          .returning()
          .all()
          .catch((error) => {
            throw new Error('SQLITE_HISTORY_WRITE_FAILED', { cause: error });
          });
    if (committed.length !== 1) throw Error('SQLITE_HISTORY_CONFLICT');
    return entries;
  }
}
