import { desc, eq, sql } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { z } from 'zod';
import { ProjectDoc, SCHEMA_VERSION, migrate } from '@patturn/schema';
import type { ProjectRecord, ProjectRepo } from './index.js';
import type { SqliteHistoryDriver } from './sqlite-history.js';

export const SQLITE_PROJECT_MAX_CHARACTERS = 256 * 1024;
const RecordSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(200),
    schemaVersion: z.number().int().min(1).max(SCHEMA_VERSION),
    data: z.unknown(),
    thumbnail: z
      .string()
      .max(128 * 1024)
      .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
      .optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
const timestamp = (value: string) => {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw Error('PROJECT_INVALID_TIMESTAMP');
  return new Date(time).toISOString();
};
/** Snapshot before awaiting I/O, then migrate/validate parameter data, never geometry. */
export function validatedProjectRecord(input: unknown): ProjectRecord {
  const serialized = JSON.stringify(input);
  if (typeof serialized !== 'string' || serialized.length > SQLITE_PROJECT_MAX_CHARACTERS)
    throw Error('PROJECT_RECORD_TOO_LARGE');
  const record = RecordSchema.parse(JSON.parse(serialized));
  const version = z
    .object({ schemaVersion: z.number().int().min(1) })
    .parse(record.data).schemaVersion;
  if (version > SCHEMA_VERSION) throw Error('PROJECT_FROM_FUTURE_VERSION');
  if (version !== record.schemaVersion) throw Error('PROJECT_VERSION_MISMATCH');
  const data = ProjectDoc.strict().parse(migrate(record.data as { schemaVersion: number }));
  const createdAt = timestamp(record.createdAt),
    updatedAt = timestamp(record.updatedAt);
  if (
    Date.parse(updatedAt) < Date.parse(createdAt) ||
    data.name.trim() !== record.name ||
    timestamp(data.createdAt) !== createdAt ||
    timestamp(data.updatedAt) !== updatedAt
  )
    throw Error('PROJECT_METADATA_MISMATCH');
  if (
    (data.form?.profile.nodes.length ?? 0) > 512 ||
    Object.keys(data.pattern?.params ?? {}).length > 128
  )
    throw Error('PROJECT_PARAMETER_LIMIT');
  const normalized: ProjectRecord = {
    ...record,
    schemaVersion: SCHEMA_VERSION,
    createdAt,
    updatedAt,
    data: { ...data, name: record.name, createdAt, updatedAt },
  };
  if (JSON.stringify(normalized).length > SQLITE_PROJECT_MAX_CHARACTERS)
    throw Error('PROJECT_RECORD_TOO_LARGE');
  return normalized;
}
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
