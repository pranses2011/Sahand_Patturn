import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { SqliteEditorHistory, type SqliteHistoryDriver } from './sqlite-history.js';
import { desktopSqliteHistory } from './desktop-sqlite-history.js';
import { EditorState } from '@patturn/schema';
const state = EditorState.parse({
  profileMode: 'reference',
  segments: 96,
  wall: 4,
  shrink: 12,
  fill: 80,
  patternId: 'grid',
  tileSize: 20,
});
function setup(database = new DatabaseSync(':memory:')) {
  const driver: SqliteHistoryDriver = {
    execute: async (query, parameters) => {
      database.prepare(query).run(...(parameters as SQLInputValue[]));
    },
    select: async (query, parameters) =>
      database.prepare(query).all(...(parameters as SQLInputValue[])),
  };
  return { database, driver, repo: new SqliteEditorHistory(driver, ['grid']) };
}
describe('Drizzle history on real SQLite', () => {
  it('initializes idempotently, persists parameter JSON and restores with a new repository', async () => {
    const { database, driver, repo } = setup();
    try {
      expect(await repo.list()).toEqual([]);
      const entries = await repo.save(state);
      const reopened = new SqliteEditorHistory(driver, ['grid']);
      expect(await reopened.list()).toEqual(entries);
      expect(await reopened.restore(entries[0]!.id)).toEqual(state);
      expect(
        database.prepare('select version,revision from patturn_editor_history').get(),
      ).toMatchObject({ version: 1, revision: 1 });
    } finally {
      database.close();
    }
  });
  it('deduplicates unchanged saves and retains at most ten states', async () => {
    const { database, repo } = setup();
    try {
      const first = await repo.save(state);
      expect(await repo.save(state)).toEqual(first);
      expect(database.prepare('select revision from patturn_editor_history').get()!.revision).toBe(
        1,
      );
      for (let i = 0; i < 12; i++) await repo.save({ ...state, tileSize: 30 + i });
      expect(await repo.list()).toHaveLength(10);
      expect((await repo.list())[0]!.state.tileSize).toBe(41);
    } finally {
      database.close();
    }
  });
  it('does not overwrite corrupted or unknown-version documents', async () => {
    const { database, repo } = setup();
    try {
      await repo.save(state);
      database.prepare("update patturn_editor_history set document = 'broken'").run();
      await expect(repo.save({ ...state, wall: 5 })).rejects.toThrow();
      expect(database.prepare('select document from patturn_editor_history').get()!.document).toBe(
        'broken',
      );
      database.exec('PRAGMA ignore_check_constraints=ON');
      database.prepare('update patturn_editor_history set version=2').run();
      await expect(repo.list()).rejects.toThrow('INVALID_ROW');
    } finally {
      database.close();
    }
  });
  it('surfaces write failure without destroying the previous state and allows retry', async () => {
    const { database, driver, repo } = setup();
    try {
      const first = await repo.save(state);
      const original = driver.select;
      driver.select = vi.fn(async (query, params) => {
        if (query.startsWith('update')) throw Error('disk full');
        return original(query, params);
      });
      await expect(repo.save({ ...state, wall: 5 })).rejects.toThrow('SQLITE_HISTORY_WRITE_FAILED');
      expect(await repo.list()).toEqual(first);
      driver.select = original;
      expect((await repo.save({ ...state, wall: 5 }))[0]!.state.wall).toBe(5);
    } finally {
      database.close();
    }
  });
  it.each([false, true])('rejects racing writers atomically, existing row=%s', async (existing) => {
    const { database, driver, repo } = setup();
    try {
      if (existing) await repo.save(state);
      else await repo.list();
      let count = 0;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = driver.select;
      driver.select = async (query, params) => {
        const rows = await original(query, params);
        if (query.startsWith('select') && count < 2) {
          count++;
          if (count === 2) release();
          await gate;
        }
        return rows;
      };
      const other = new SqliteEditorHistory(driver, ['grid']);
      const results = await Promise.allSettled([
        repo.save({ ...state, wall: 5 }),
        other.save({ ...state, wall: 6 }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(String(failed.reason)).toContain('SQLITE_HISTORY_CONFLICT');
      expect((await repo.list())[0]!.state.wall).toBeOneOf([5, 6]);
    } finally {
      database.close();
    }
  });
  it('captures caller data before awaiting the database', async () => {
    const { database, repo } = setup();
    try {
      const input = { ...state };
      const now = new Date('2026-01-01T00:00:00Z');
      const pending = repo.save(input, now);
      input.wall = 6;
      now.setUTCFullYear(2030);
      const entries = await pending;
      expect(entries[0]!.state.wall).toBe(4);
      expect(entries[0]!.savedAt).toBe('2026-01-01T00:00:00.000Z');
    } finally {
      database.close();
    }
  });
  it('validates patterns/date and keeps missing restore errors explicit', async () => {
    const { database, repo } = setup();
    try {
      await expect(repo.save({ ...state, patternId: 'unknown' })).rejects.toThrow(
        'UNKNOWN_PATTERN',
      );
      await expect(repo.save(state, new Date(NaN))).rejects.toThrow('INVALID_DATE');
      await expect(repo.restore('missing')).rejects.toThrow('NOT_FOUND');
    } finally {
      database.close();
    }
  });
  it('retries schema initialization failures and never opens SQL in browser runtime', async () => {
    const { database, driver, repo } = setup();
    try {
      const original = driver.execute;
      driver.execute = vi.fn().mockRejectedValueOnce(Error('locked')).mockImplementation(original);
      await expect(repo.list()).rejects.toThrow('locked');
      expect(await repo.list()).toEqual([]);
      await expect(desktopSqliteHistory(['grid'])).rejects.toThrow('REQUIRE_TAURI');
    } finally {
      database.close();
    }
  });
});

it('survives closing and reopening an on-disk SQLite database', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'patturn-sqlite-'));
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(join(folder, 'history.db'));
    const first = setup(db);
    const entries = await first.repo.save(state);
    db.close();
    db = null;
    db = new DatabaseSync(join(folder, 'history.db'));
    expect(await setup(db).repo.list()).toEqual(entries);
  } finally {
    db?.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
it('maps named SQL columns independently of object key order', async () => {
  const { database, driver, repo } = setup();
  try {
    const original = driver.select;
    driver.select = async (query, params) =>
      (await original(query, params)).map((row) =>
        Object.fromEntries(Object.entries(row).reverse()),
      );
    const entries = await repo.save(state);
    expect(await repo.list()).toEqual(entries);
  } finally {
    database.close();
  }
});
it('does not expose serialized project parameters in write error messages', async () => {
  const { database, driver, repo } = setup();
  try {
    await repo.list();
    const original = driver.select;
    driver.select = async (query, parameters) => {
      if (query.startsWith('insert')) throw Error(`driver diagnostic ${JSON.stringify(state)}`);
      return original(query, parameters);
    };
    let failure: unknown;
    try {
      await repo.save(state);
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).toContain('SQLITE_HISTORY_WRITE_FAILED');
    expect(String(failure)).not.toContain('profileMode');
    driver.select = async () => {
      throw Error('connection failed');
    };
    // Read failure is sanitized before a write can run.
    await expect(repo.save(state)).rejects.toThrow('SQLITE_HISTORY_READ_FAILED');
  } finally {
    database.close();
  }
});
it('refuses revision exhaustion without wrapping or replacing the document', async () => {
  const { database, repo } = setup();
  try {
    const entries = await repo.save(state);
    database.prepare('update patturn_editor_history set revision=?').run(Number.MAX_SAFE_INTEGER);
    await expect(repo.save({ ...state, wall: 5 })).rejects.toThrow('REVISION_LIMIT');
    expect(await repo.list()).toEqual(entries);
  } finally {
    database.close();
  }
});
