/**
 * Platform storage contract (ADR-004/009): SQLite is source of truth on desktop;
 * this package defines the adapter interface + an in-memory/localStorage impl for web.
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
  delete(id: string): Promise<void>;
  duplicate(id: string, newName: string): Promise<ProjectRecord>;
}

/** Web adapter — localStorage (offline-first; IndexedDB can replace it later). */
export class LocalRepo implements ProjectRepo {
  private key = 'patturn:projects';
  private read(): ProjectRecord[] {
    try {
      return JSON.parse(localStorage.getItem(this.key) ?? '[]');
    } catch {
      return [];
    }
  }
  private write(list: ProjectRecord[]) {
    localStorage.setItem(this.key, JSON.stringify(list));
  }
  async list() { return this.read().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async get(id: string) { return this.read().find((r) => r.id === id) ?? null; }
  async save(rec: ProjectRecord) {
    const list = this.read();
    const i = list.findIndex((r) => r.id === rec.id);
    if (i >= 0) list[i] = rec; else list.push(rec);
    this.write(list);
  }
  async delete(id: string) { this.write(this.read().filter((r) => r.id !== id)); }
  async duplicate(id: string, newName: string) {
    const src = await this.get(id);
    if (!src) throw new Error('NOT_FOUND');
    const copy: ProjectRecord = {
      ...src,
      id: crypto.randomUUID(),
      name: newName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.save(copy);
    return copy;
  }
}

/** File export/import of a project as .patturn (JSON). */
export function serializeProject(rec: ProjectRecord): string {
  return JSON.stringify({ format: 'patturn', v: 1, project: rec }, null, 2);
}
export function parseProject(text: string): ProjectRecord {
  const o = JSON.parse(text);
  if (o.format !== 'patturn') throw new Error('NOT_PATTURN_FILE');
  return o.project as ProjectRecord;
}

export * from './portable.js';
export * from './history.js';
export * from './native-files.js';
export * from './backups.js';
