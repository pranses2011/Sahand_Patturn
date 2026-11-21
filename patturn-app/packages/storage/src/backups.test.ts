import { describe, it, expect, vi } from 'vitest';
import { EditorBackups, BACKUP_LIMIT, type BackupDriver, desktopBackups } from './index.js';
import type { EditorState } from '@patturn/schema';
const state: EditorState = {
  profileMode: 'vase',
  segments: 96,
  wall: 4,
  shrink: 12,
  fill: 80,
  patternId: 'dot-grid',
  tileSize: 40,
};
function setup() {
  const files = new Map<string, Uint8Array>();
  const driver: BackupDriver = {
    mkdir: vi.fn(async () => {}),
    list: async () => [...files.keys()].map((name) => ({ name, isFile: true, isSymlink: false })),
    write: vi.fn(async (name, bytes) => {
      files.set(name, bytes);
    }),
    rename: vi.fn(async (from, to) => {
      files.set(to, files.get(from)!);
      files.delete(from);
    }),
    remove: vi.fn(async (name) => {
      files.delete(name);
    }),
    read: async (name) => files.get(name)!,
    size: async (name) => files.get(name)!.length,
  };
  return { files, driver, repo: new EditorBackups(driver, ['dot-grid']) };
}
describe('Desktop folder backups', () => {
  it('BKP1: commits temp before listing and restores a validated portable project', async () => {
    const { files, driver, repo } = setup();
    const result = await repo.save(state);
    expect(result.warnings).toEqual([]);
    expect(files.size).toBe(1);
    expect(driver.write).toHaveBeenCalledWith(result.entry.name + '.tmp', expect.any(Uint8Array));
    expect(driver.rename).toHaveBeenCalledWith(result.entry.name + '.tmp', result.entry.name);
    expect(await repo.restore(result.entry.name)).toEqual(state);
    expect((await repo.save(state)).entry).toEqual(result.entry);
  });
  it('BKP2: serializes concurrent writes and prunes only generated committed backups', async () => {
    const { files, repo } = setup();
    files.set('notes.txt', new Uint8Array());
    files.set('old.patturn.tmp', new Uint8Array());
    await Promise.all(
      Array.from({ length: 13 }, (_, i) =>
        repo.save({ ...state, fill: i }, new Date(2026, 0, 1, 0, 0, i)),
      ),
    );
    expect(await repo.list()).toHaveLength(BACKUP_LIMIT);
    expect(files.has('notes.txt')).toBe(true);
    expect(files.has('old.patturn.tmp')).toBe(true);
    expect((await repo.restore((await repo.list())[0]!.name)).fill).toBe(12);
  });
  it('BKP3: failed writes or renames never prune previous backups, queue recovers', async () => {
    const { files, driver, repo } = setup();
    const first = await repo.save(state);
    const original = driver.rename;
    driver.rename = vi.fn(async () => {
      throw new Error('disk failure');
    });
    await expect(repo.save({ ...state, fill: 10 })).rejects.toThrow('disk failure');
    expect([...files.keys()]).toEqual([first.entry.name]);
    driver.rename = original;
    expect((await repo.save({ ...state, fill: 20 })).entry.name).not.toBe(first.entry.name);
  });
  it('BKP4: rejects unsafe names, corrupt data, symlinks and oversized files', async () => {
    const { files, driver, repo } = setup();
    const entry = (await repo.save(state)).entry;
    await expect(repo.restore('../x.patturn')).rejects.toThrow('NOT_FOUND');
    driver.list = async () => [{ name: entry.name, isFile: true, isSymlink: true }];
    expect(await repo.list()).toEqual([]);
    await expect(repo.restore(entry.name)).rejects.toThrow('NOT_FOUND');
    driver.list = async () => [{ name: entry.name, isFile: true, isSymlink: false }];
    files.set(entry.name, new Uint8Array([1, 2]));
    await expect(repo.restore(entry.name)).rejects.toThrow();
    files.set(entry.name, new Uint8Array(300000));
    await expect(repo.restore(entry.name)).rejects.toThrow('TOO_LARGE');
  });
  it('BKP5: browser cannot initialize native folder storage', async () => {
    await expect(desktopBackups(['dot-grid'])).rejects.toThrow('REQUIRE_TAURI');
  });
  it('BKP6: identical or backwards timestamps still sort snapshots by commit order', async () => {
    const { repo } = setup();
    const same = new Date('2026-01-01T00:00:00Z');
    await repo.save(state, same);
    await repo.save({ ...state, fill: 10 }, same);
    await repo.save({ ...state, fill: 20 }, new Date('2025-01-01T00:00:00Z'));
    expect((await repo.restore((await repo.list())[0]!.name)).fill).toBe(20);
    await expect(repo.save({ ...state, patternId: 'unknown' })).rejects.toThrow('UNKNOWN_PATTERN');
  });
  it('BKP7: pruning failure warns but keeps the committed new snapshot', async () => {
    const { repo, driver } = setup();
    for (let i = 0; i < BACKUP_LIMIT; i++) await repo.save({ ...state, fill: i });
    driver.remove = vi.fn(async () => {
      throw new Error('locked');
    });
    const result = await repo.save({ ...state, fill: 50 });
    expect(result.warnings[0]).toContain('PRUNE_FAILED');
    expect((await repo.restore(result.entry.name)).fill).toBe(50);
    expect(await repo.list()).toHaveLength(BACKUP_LIMIT + 1);
  });
});
