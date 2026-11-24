import { validatedProjectRecord } from './project-record.js';
import type { ProjectRecord, ProjectRepo } from './index.js';
import type { HistoryStorage } from './history.js';
/** Validated web counterpart; unreadable data is never interpreted as an empty library. */
export class LocalRepo implements ProjectRepo {
  constructor(private source: () => HistoryStorage = () => localStorage) {}
  private read(): ProjectRecord[] {
    const raw = this.source().getItem('patturn:projects');
    if (raw === null) return [];
    if (raw.length > 4 * 1024 * 1024) throw Error('PROJECT_LIBRARY_TOO_LARGE');
    const records: unknown = JSON.parse(raw);
    if (!Array.isArray(records) || records.length > 100) throw Error('PROJECT_LIBRARY_INVALID');
    const parsed = records.map(validatedProjectRecord);
    if (new Set(parsed.map((p) => p.id)).size !== parsed.length)
      throw Error('PROJECT_DUPLICATE_ID');
    return parsed;
  }
  private write(records: ProjectRecord[]) {
    const value = JSON.stringify(records);
    if (records.length > 100 || value.length > 4 * 1024 * 1024)
      throw Error('PROJECT_LIBRARY_TOO_LARGE');
    this.source().setItem('patturn:projects', value);
  }
  async list() {
    return this.read().sort(
      (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
    );
  }
  async get(id: string) {
    return this.read().find((p) => p.id === id) ?? null;
  }
  async save(input: ProjectRecord) {
    const record = validatedProjectRecord(input),
      records = this.read();
    const index = records.findIndex((p) => p.id === record.id);
    if (index < 0) records.push(record);
    else records[index] = record;
    this.write(records);
  }
  async delete(id: string) {
    this.write(this.read().filter((p) => p.id !== id));
  }
  async duplicate(id: string, newName: string) {
    const source = await this.get(id);
    if (!source) throw Error('NOT_FOUND');
    const now = new Date().toISOString();
    const copy = validatedProjectRecord({
      ...source,
      id: crypto.randomUUID(),
      name: newName,
      createdAt: now,
      updatedAt: now,
      data: { ...(source.data as object), name: newName, createdAt: now, updatedAt: now },
    });
    const records = this.read();
    if (records.some((p) => p.id === copy.id)) throw Error('PROJECT_ID_CONFLICT');
    records.push(copy);
    this.write(records);
    return copy;
  }
}
