import { desc, eq, sql } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { z } from 'zod';
import { ProjectDoc } from '@patturn/schema';
import type { ProjectRecord, ProjectRepo } from './index.js';
import type { SqliteHistoryDriver } from './sqlite-history.js';

import {
  importedProjectCopy,
  validatedProjectRecord,
  SQLITE_PROJECT_MAX_CHARACTERS,
} from './project-record.js';
export { validatedProjectRecord, SQLITE_PROJECT_MAX_CHARACTERS } from './project-record.js';
const RecordSchema = z.object({ id: z.string().min(1).max(100) });
const projects = sqliteTable('patturn_projects', {
  id: text('id').primaryKey(),
  document: text('document').notNull(),
  updatedAt: text('updated_at').notNull(),
});
const SCHEMA = `CREATE TABLE IF NOT EXISTS patturn_projects (
  id TEXT PRIMARY KEY NOT NULL,
  document TEXT NOT NULL CHECK(length(document) <= 262144),
  updated_at TEXT NOT NULL
)`;

/** General ProjectDoc repository, distinct from the preset editor's autosave history.
 * save replaces an explicitly supplied ID but protects the read/write interval with document CAS.
 * It cannot detect edits that predate a caller's save operation (no revision token in ProjectRepo).
 */
export class SqliteProjectRepo implements ProjectRepo {
  private db;
  private ready: Promise<void> | null = null;
  constructor(private driver: SqliteHistoryDriver) {
    this.db = drizzle(async (query, parameters, method) => {
      if (method === 'run') {
        await driver.execute(query, parameters);
        return { rows: [] };
      }
      const rows = await driver.select(query, parameters);
      // All private select/returning operations project the whole table in this order.
      return { rows: rows.map((row) => [row.id, row.document, row.updated_at]) };
    });
  }
  private init() {
    if (!this.ready)
      this.ready = this.driver.execute(SCHEMA, []).catch((error) => {
        this.ready = null;
        throw new Error('SQLITE_PROJECT_INIT_FAILED', { cause: error });
      });
    return this.ready;
  }
  private decode(row: typeof projects.$inferSelect): ProjectRecord {
    if (typeof row.document !== 'string' || row.document.length > SQLITE_PROJECT_MAX_CHARACTERS)
      throw Error('PROJECT_RECORD_TOO_LARGE');
    const record = validatedProjectRecord(JSON.parse(row.document));
    if (record.id !== row.id || record.updatedAt !== row.updatedAt)
      throw Error('PROJECT_INDEX_MISMATCH');
    return record;
  }
  async list(): Promise<ProjectRecord[]> {
    await this.init();
    const rows = await this.db
      .select()
      .from(projects)
      .orderBy(desc(projects.updatedAt), projects.id)
      .all()
      .catch((error) => {
        throw new Error('SQLITE_PROJECT_READ_FAILED', { cause: error });
      });
    return rows.map((row) => this.decode(row));
  }
  private async row(inputId: string) {
    const id = RecordSchema.shape.id.parse(inputId);
    await this.init();
    const rows = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .all()
      .catch((error) => {
        throw new Error('SQLITE_PROJECT_READ_FAILED', { cause: error });
      });
    return rows[0];
  }
  async get(id: string): Promise<ProjectRecord | null> {
    const row = await this.row(id);
    return row ? this.decode(row) : null;
  }
  async save(input: ProjectRecord): Promise<void> {
    const record = validatedProjectRecord(input);
    const previous = await this.row(record.id);
    if (previous) this.decode(previous); // never replace corrupt/future data silently
    const values = { id: record.id, document: JSON.stringify(record), updatedAt: record.updatedAt };
    const rows = await this.db
      .insert(projects)
      .values(values)
      .onConflictDoUpdate({
        target: projects.id,
        set: values,
        setWhere: previous ? eq(projects.document, previous.document) : sql`0`,
      })
      .returning()
      .all()
      .catch((error) => {
        throw new Error('SQLITE_PROJECT_WRITE_FAILED', { cause: error });
      });
    if (rows.length !== 1) throw Error('SQLITE_PROJECT_CONFLICT');
  }
  async importCopy(input: ProjectRecord): Promise<ProjectRecord> {
    const copy = importedProjectCopy(input);
    await this.init();
    const rows = await this.db
      .insert(projects)
      .values({ id: copy.id, document: JSON.stringify(copy), updatedAt: copy.updatedAt })
      .onConflictDoNothing()
      .returning()
      .all()
      .catch((error) => {
        throw new Error('SQLITE_PROJECT_WRITE_FAILED', { cause: error });
      });
    if (rows.length !== 1) throw Error('PROJECT_ID_CONFLICT');
    return copy;
  }
  /** Single atomic statement: copy a validated browser snapshot only into an empty table.
   * Never clears the source or replaces existing SQL records, even under concurrent writers.
   */
  async importIntoEmpty(inputs: ProjectRecord[]): Promise<number> {
    if (!Array.isArray(inputs) || inputs.length > 100) throw Error('PROJECT_LIBRARY_INVALID');
    const records = inputs.map(validatedProjectRecord);
    if (new Set(records.map((record) => record.id)).size !== records.length)
      throw Error('PROJECT_DUPLICATE_ID');
    const snapshot = JSON.stringify(records);
    if (snapshot.length > 4 * 1024 * 1024) throw Error('PROJECT_LIBRARY_TOO_LARGE');
    if (!records.length) return 0;
    await this.init();
    const rows = await this.driver
      .select(
        `INSERT INTO patturn_projects (id, document, updated_at)
       SELECT json_extract(value, '$.id'), value, json_extract(value, '$.updatedAt')
       FROM json_each(?)
       WHERE NOT EXISTS (SELECT 1 FROM patturn_projects)
       RETURNING id`,
        [snapshot],
      )
      .catch((error) => {
        throw new Error('SQLITE_PROJECT_IMPORT_FAILED', { cause: error });
      });
    if (rows.length !== records.length) throw Error('SQLITE_PROJECT_IMPORT_NOT_EMPTY');
    return rows.length;
  }
  async delete(id: string): Promise<void> {
    RecordSchema.shape.id.parse(id);
    await this.init();
    await this.db
      .delete(projects)
      .where(eq(projects.id, id))
      .run()
      .catch((error) => {
        throw new Error('SQLITE_PROJECT_DELETE_FAILED', { cause: error });
      });
  }
  async duplicate(id: string, newName: string): Promise<ProjectRecord> {
    // Validate mutable arguments before awaits and do not alias nested source parameters.
    const name = z.string().trim().min(1).max(200).parse(newName);
    const source = await this.get(id);
    if (!source) throw Error('NOT_FOUND');
    const now = new Date().toISOString();
    const data = source.data as z.infer<typeof ProjectDoc>;
    const copy = validatedProjectRecord({
      ...source,
      id: crypto.randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
      data: { ...data, name, createdAt: now, updatedAt: now },
    });
    const rows = await this.db
      .insert(projects)
      .values({ id: copy.id, document: JSON.stringify(copy), updatedAt: copy.updatedAt })
      .onConflictDoNothing()
      .returning()
      .all()
      .catch((error) => {
        throw new Error('SQLITE_PROJECT_WRITE_FAILED', { cause: error });
      });
    if (rows.length !== 1) throw Error('PROJECT_ID_CONFLICT');
    return copy;
  }
}
