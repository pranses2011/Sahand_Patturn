import { validatedProjectRecord } from './project-record.js';
/**
 * Platform storage contract (ADR-004/009): SQLite is the intended desktop source of truth.
 * Desktop editor history uses SQLite; browser history and other local libraries use localStorage.
 */
export interface ProjectRecord {
  id: string;
  name: string;
  schemaVersion: number;
  data: unknown; // ProjectDoc (params, NOT mesh)
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRepo {
  list(): Promise<ProjectRecord[]>;
  get(id: string): Promise<ProjectRecord | null>;
  save(rec: ProjectRecord): Promise<void>;
  updateIfUnchanged(previous: ProjectRecord, next: ProjectRecord): Promise<void>;
  delete(id: string): Promise<void>;
  duplicate(id: string, newName: string): Promise<ProjectRecord>;
}

export { LocalRepo } from './local-projects.js';

/** File export/import of a project as .patturn (JSON). */
export function serializeProject(rec: ProjectRecord): string {
  return JSON.stringify({ format: 'patturn', v: 1, project: validatedProjectRecord(rec) }, null, 2);
}
export function parseProject(text: string): ProjectRecord {
  if (text.length > 512 * 1024) throw Error('PROJECT_FILE_TOO_LARGE');
  const o = JSON.parse(text);
  if (o?.format !== 'patturn' || o.v !== 1) throw new Error('NOT_PATTURN_FILE');
  return validatedProjectRecord(o.project);
}

export * from './portable.js';
export * from './history.js';
export * from './native-files.js';
export * from './backups.js';
export * from './parameter-history.js';
export * from './pattern-library.js';

export * from './local-profile.js';
export * from './feature-requests.js';
export { desktopSqliteHistory } from './desktop-sqlite-history.js';
export type { SqliteHistoryDriver } from './sqlite-history.js';
export { desktopProjectRepo } from './desktop-projects.js';
