import type { EditorState } from '@patturn/schema';
import { encodeEditorProject, decodeEditorProject, MAX_PROJECT_FILE_BYTES } from './portable.js';
import { isDesktop } from './native-files.js';

export const BACKUP_FOLDER = 'backups';
export const BACKUP_LIMIT = 10;
const NAME = /^editor-backup-\d{8}T\d{9}Z-[0-9a-f-]{36}\.patturn$/;
export interface BackupEntry {
  name: string;
}
export interface BackupDriver {
  mkdir(): Promise<void>;
  list(): Promise<{ name: string; isFile: boolean; isSymlink: boolean }[]>;
  write(name: string, bytes: Uint8Array): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(name: string): Promise<void>;
  read(name: string): Promise<Uint8Array>;
  size(name: string): Promise<number>;
}

/** Only our generated names are read/pruned; unrelated files are untouched. */
export class EditorBackups {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private driver: BackupDriver,
    private patterns: readonly string[],
  ) {}
  async list(): Promise<BackupEntry[]> {
    await this.driver.mkdir();
    return (await this.driver.list())
      .filter((e) => e.isFile && !e.isSymlink && NAME.test(e.name))
      .map(({ name }) => ({ name }))
      .sort((a, b) => (a.name < b.name ? 1 : -1));
  }
  async restore(name: string): Promise<EditorState> {
    if (!NAME.test(name) || !(await this.list()).some((e) => e.name === name))
      throw new Error('BACKUP_NOT_FOUND');
    const size = await this.driver.size(name);
    if (!Number.isFinite(size) || size < 0 || size > MAX_PROJECT_FILE_BYTES)
      throw new Error('PROJECT_FILE_TOO_LARGE');
    return decodeEditorProject(await this.driver.read(name), this.patterns);
  }
  save(state: EditorState, now = new Date()): Promise<{ entry: BackupEntry; warnings: string[] }> {
    if (!this.patterns.includes(state.patternId))
      return Promise.reject(new Error('PROJECT_UNKNOWN_PATTERN'));
    const bytes = encodeEditorProject(state); // snapshot before entering the queue
    const requestedTime = now.getTime();
    if (!Number.isFinite(requestedTime)) throw new Error('BACKUP_INVALID_TIMESTAMP');
    const task = this.queue.then(async () => {
      const existing = await this.list();
      if (existing[0]) {
        try {
          const previous = encodeEditorProject(await this.restore(existing[0].name));
          if (previous.length === bytes.length && previous.every((v, i) => v === bytes[i]))
            return { entry: existing[0], warnings: [] };
        } catch {
          /* Preserve corrupt backup, but allow creating a new valid snapshot. */
        }
      }
      const lastStamp = existing[0]?.name.slice(14, 33);
      const lastTime = lastStamp
        ? Date.parse(
            lastStamp.replace(/^(....)(..)(..)T(..)(..)(..)(...)Z$/, '$1-$2-$3T$4:$5:$6.$7Z'),
          )
        : 0;
      const timestamp = new Date(
        Math.max(requestedTime, Number.isFinite(lastTime) ? lastTime + 1 : 0),
      )
        .toISOString()
        .replace(/[-:.]/g, '');
      const name = `editor-backup-${timestamp}-${crypto.randomUUID()}.patturn`;
      if (!NAME.test(name)) throw new Error('BACKUP_INVALID_TIMESTAMP');
      const temporary = `${name}.tmp`;
      try {
        await this.driver.write(temporary, bytes);
        await this.driver.rename(temporary, name);
      } catch (error) {
        try {
          await this.driver.remove(temporary);
        } catch {
          /* best-effort cleanup */
        }
        throw error;
      }
      const warnings: string[] = [];
      // Retention runs only AFTER a successful commit of the new backup.
      let committed: BackupEntry[];
      try {
        committed = await this.list();
      } catch (error) {
        return { entry: { name }, warnings: [`BACKUP_RETENTION_LIST_FAILED:${String(error)}`] };
      }
      for (const old of committed.slice(BACKUP_LIMIT)) {
        try {
          await this.driver.remove(old.name);
        } catch (error) {
          warnings.push(`BACKUP_PRUNE_FAILED:${String(error)}`);
        }
      }
      return { entry: { name }, warnings };
    });
    this.queue = task.catch(() => {});
    return task;
  }
}

let cached: Promise<EditorBackups> | null = null;
export function desktopBackups(patterns: readonly string[]): Promise<EditorBackups> {
  if (!isDesktop()) return Promise.reject(new Error('BACKUPS_REQUIRE_TAURI'));
  if (!cached)
    cached = import('@tauri-apps/plugin-fs')
      .then((fs) => {
        const options = { baseDir: fs.BaseDirectory.AppLocalData };
        const path = (name: string) => {
          if (!NAME.test(name) && !(name.endsWith('.tmp') && NAME.test(name.slice(0, -4))))
            throw new Error('BACKUP_UNSAFE_PATH');
          return `${BACKUP_FOLDER}/${name}`;
        };
        return new EditorBackups(
          {
            mkdir: () => fs.mkdir(BACKUP_FOLDER, { ...options, recursive: true }),
            list: () => fs.readDir(BACKUP_FOLDER, options),
            write: (name, bytes) => fs.writeFile(path(name), bytes, options),
            read: (name) => fs.readFile(path(name), options),
            size: async (name) => (await fs.stat(path(name), options)).size,
            rename: (from, to) =>
              fs.rename(path(from), path(to), {
                oldPathBaseDir: options.baseDir,
                newPathBaseDir: options.baseDir,
              }),
            remove: (name) => fs.remove(path(name), options),
          },
          patterns,
        );
      })
      .catch((error) => {
        cached = null;
        throw error;
      });
  return cached;
}
