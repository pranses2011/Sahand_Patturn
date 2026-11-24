import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SqliteProjectRepo, validatedProjectRecord } from './sqlite-projects.js';
import { desktopProjectRepo } from './desktop-projects.js';
import type { ProjectRecord } from './index.js';
import type { SqliteHistoryDriver } from './sqlite-history.js';
const date = '2020-01-01T00:00:00.000Z';
function fixture(id = 'one', name = 'پروژه'): ProjectRecord {
  return {
    id,
    name,
    schemaVersion: 3,
    createdAt: date,
    updatedAt: date,
    data: {
      schemaVersion: 3,
      name,
      settings: { unit: 'mm', shrink: 0.12, wallThickness: 4 },
      createdAt: date,
      updatedAt: date,
    },
  };
}
function setup(db = new DatabaseSync(':memory:')) {
  const driver: SqliteHistoryDriver = {
    execute: async (query, params) => {
      db.prepare(query).run(...(params as SQLInputValue[]));
    },
    select: async (query, params) => db.prepare(query).all(...(params as SQLInputValue[])),
  };
  return { db, driver, repo: new SqliteProjectRepo(driver) };
}
describe('General parameter project repository on real SQLite', () => {
  it('supports empty, create, read, update, sorted list and delete without affecting other IDs', async () => {
    const { db, repo } = setup();
    try {
      expect(await repo.list()).toEqual([]);
      expect(await repo.get('missing')).toBeNull();
      await repo.save(fixture());
      await repo.save(fixture('two'));
      const changed = {
        ...fixture(),
        updatedAt: '2021-01-01T00:00:00.000Z',
        data: { ...(fixture().data as object), updatedAt: '2021-01-01T00:00:00.000Z' },
      };
      await repo.save(changed);
      expect(await repo.get('one')).toEqual(changed);
      expect((await repo.list()).map((r) => r.id)).toEqual(['one', 'two']);
      await repo.delete('one');
      await repo.delete('missing');
      expect((await repo.list()).map((r) => r.id)).toEqual(['two']);
    } finally {
      db.close();
    }
  });
  it('binds hostile IDs/names as data rather than SQL', async () => {
    const { db, repo } = setup();
    try {
      const id = "x'; DROP TABLE patturn_projects; --",
        name = 'آزمون \' " ; --';
      await repo.save(fixture(id, name));
      expect((await repo.get(id))!.name).toBe(name);
      await repo.save(fixture());
      await repo.delete(id);
      expect(await repo.get('one')).not.toBeNull();
    } finally {
      db.close();
    }
  });
  it('duplicates nested parameters with independent identity, metadata and timestamp', async () => {
    const { db, repo } = setup();
    try {
      await repo.save(fixture());
      const copy = await repo.duplicate('one', 'کپی');
      expect(copy.id).not.toBe('one');
      expect(copy.name).toBe('کپی');
      expect(copy.createdAt).not.toBe(date);
      expect(copy.data).toMatchObject({
        name: 'کپی',
        createdAt: copy.createdAt,
        updatedAt: copy.updatedAt,
      });
      (copy.data as { settings: { shrink: number } }).settings.shrink = 0.2;
      expect((await repo.get('one'))!.data).toMatchObject({ settings: { shrink: 0.12 } });
      expect((await repo.get(copy.id))!.data).toMatchObject({ settings: { shrink: 0.12 } });
    } finally {
      db.close();
    }
  });
  it.each([1, 2])(
    'migrates a version %s parameter project on read without destructive rewrite',
    async (version) => {
      const { db, repo } = setup();
      try {
        await repo.list();
        const old = fixture();
        old.schemaVersion = version;
        (old.data as { schemaVersion: number }).schemaVersion = version;
        if (version === 1) delete (old.data as { settings?: unknown }).settings;
        const raw = JSON.stringify(old);
        db.prepare('insert into patturn_projects values(?,?,?)').run(old.id, raw, date);
        expect(await repo.get(old.id)).toMatchObject({
          schemaVersion: 3,
          data: { schemaVersion: 3, settings: { unit: 'mm' } },
        });
        expect(db.prepare('select document from patturn_projects').get()!.document).toBe(raw);
      } finally {
        db.close();
      }
    },
  );
  it('persists across closing and reopening an on-disk database', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'patturn-projects-'));
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(join(folder, 'projects.db'));
      await setup(db).repo.save(fixture());
      db.close();
      db = null;
      db = new DatabaseSync(join(folder, 'projects.db'));
      expect(await setup(db).repo.get('one')).toEqual(fixture());
    } finally {
      db?.close();
      rmSync(folder, { recursive: true, force: true });
    }
  });
  it('takes a full snapshot before database awaits', async () => {
    const { db, repo } = setup();
    try {
      const record = fixture(),
        pending = repo.save(record);
      record.name = 'changed';
      (record.data as { settings: { shrink: number } }).settings.shrink = 0.3;
      await pending;
      expect(await repo.get('one')).toEqual(fixture());
    } finally {
      db.close();
    }
  });
  it('does not replace a corrupt stored document, and preserves unrelated projects', async () => {
    const { db, repo } = setup();
    try {
      await repo.save(fixture());
      await repo.save(fixture('two'));
      db.prepare("update patturn_projects set document='broken' where id='one'").run();
      await expect(repo.save(fixture())).rejects.toThrow();
      await expect(repo.list()).rejects.toThrow();
      expect(
        db.prepare("select document from patturn_projects where id='one'").get()!.document,
      ).toBe('broken');
      expect(await repo.get('two')).toEqual(fixture('two'));
    } finally {
      db.close();
    }
  });
  it('keeps newer-format records untouched', async () => {
    const { db, repo } = setup();
    try {
      await repo.save(fixture());
      const future = fixture();
      (future.data as { schemaVersion: number }).schemaVersion = 4;
      const raw = JSON.stringify(future);
      db.prepare('update patturn_projects set document=?').run(raw);
      await expect(repo.save(fixture())).rejects.toThrow('FUTURE_VERSION');
      expect(db.prepare('select document from patturn_projects').get()!.document).toBe(raw);
    } finally {
      db.close();
    }
  });
  it.each([false, true])('rejects an operation-level race, existing=%s', async (existing) => {
    const { db, driver, repo } = setup();
    try {
      if (existing) await repo.save(fixture());
      else await repo.list();
      const original = driver.select;
      let count = 0;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      driver.select = async (query, params) => {
        const rows = await original(query, params);
        if (query.startsWith('select') && count < 2) {
          if (++count === 2) release();
          await gate;
        }
        return rows;
      };
      const other = new SqliteProjectRepo(driver);
      const result = await Promise.allSettled([
        repo.save(fixture('one', 'الف')),
        other.save(fixture('one', 'ب')),
      ]);
      expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        String((result.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason),
      ).toContain('SQLITE_PROJECT_CONFLICT');
    } finally {
      db.close();
    }
  });
  it('preserves the original when duplicate UUID generation collides', async () => {
    const { db, repo } = setup();
    try {
      await repo.save(fixture());
      const spy = vi
        .spyOn(crypto, 'randomUUID')
        .mockReturnValue('one' as `${string}-${string}-${string}-${string}-${string}`);
      try {
        await expect(repo.duplicate('one', 'copy')).rejects.toThrow('PROJECT_ID_CONFLICT');
      } finally {
        spy.mockRestore();
      }
      expect(await repo.get('one')).toEqual(fixture());
    } finally {
      db.close();
    }
  });
  it('sanitizes SQL failures, preserves old data and supports retry', async () => {
    const { db, driver, repo } = setup();
    try {
      await repo.save(fixture());
      const original = driver.select;
      driver.select = async (query, params) => {
        if (query.startsWith('insert')) throw Error('private document data');
        return original(query, params);
      };
      await expect(repo.save(fixture('one', 'new'))).rejects.toThrow('SQLITE_PROJECT_WRITE_FAILED');
      expect(await repo.get('one')).toEqual(fixture());
      driver.select = original;
      await repo.save(fixture('one', 'new'));
      expect((await repo.get('one'))!.name).toBe('new');
    } finally {
      db.close();
    }
  });
  it('retries initialization and does not load SQL in browser runtime', async () => {
    const { db, driver, repo } = setup();
    try {
      const original = driver.execute;
      driver.execute = vi.fn().mockRejectedValueOnce(Error('locked')).mockImplementation(original);
      await expect(repo.list()).rejects.toThrow('SQLITE_PROJECT_INIT_FAILED');
      expect(await repo.list()).toEqual([]);
      await expect(desktopProjectRepo()).rejects.toThrow('REQUIRE_TAURI');
      await expect(repo.duplicate('missing', 'copy')).rejects.toThrow('NOT_FOUND');
    } finally {
      db.close();
    }
  });
});
it.each([
  { name: '' },
  { schemaVersion: 4 },
  { createdAt: 'bad' },
  { updatedAt: '1990-01-01' },
  { data: { ...(fixture().data as object), mesh: { positions: [0, 0, 0] } } },
  { data: { ...(fixture().data as object), name: 'mismatch' } },
  { thumbnail: 'javascript:alert(1)' },
  { name: 'x'.repeat(300000) },
])('rejects invalid metadata, mesh payload or excessive records %#', (override) => {
  expect(() => validatedProjectRecord({ ...fixture(), ...override })).toThrow();
});

it('does not depend on native result object column order and rejects index/document mismatch', async () => {
  const { db, driver, repo } = setup();
  try {
    const original = driver.select;
    driver.select = async (query, params) =>
      (await original(query, params)).map((row) =>
        Object.fromEntries(Object.entries(row).reverse()),
      );
    await repo.save(fixture());
    expect(await repo.get('one')).toEqual(fixture());
    db.prepare("update patturn_projects set updated_at='2021-01-01T00:00:00.000Z'").run();
    await expect(repo.get('one')).rejects.toThrow('PROJECT_INDEX_MISMATCH');
    await expect(repo.save(fixture())).rejects.toThrow('PROJECT_INDEX_MISMATCH');
  } finally {
    db.close();
  }
});
it('keeps data when delete fails and allows a later explicit retry', async () => {
  const { db, driver, repo } = setup();
  try {
    await repo.save(fixture());
    const original = driver.execute;
    driver.execute = async (query, params) => {
      if (query.startsWith('delete')) throw Error('private data');
      await original(query, params);
    };
    await expect(repo.delete('one')).rejects.toThrow('SQLITE_PROJECT_DELETE_FAILED');
    expect(await repo.get('one')).toEqual(fixture());
    driver.execute = original;
    await repo.delete('one');
    expect(await repo.get('one')).toBeNull();
  } finally {
    db.close();
  }
});
it('validates save before initialization and bounds identifiers before any native query', async () => {
  const driver = { execute: vi.fn(), select: vi.fn() };
  const repo = new SqliteProjectRepo(driver);
  await expect(repo.save({ ...fixture(), name: '' })).rejects.toThrow();
  await expect(repo.get('x'.repeat(101))).rejects.toThrow();
  await expect(repo.delete('')).rejects.toThrow();
  expect(driver.execute).not.toHaveBeenCalled();
  expect(driver.select).not.toHaveBeenCalled();
});

describe('Atomic browser snapshot import', () => {
  it('copies all records with metadata and refuses repeat or nonempty import', async () => {
    const { db, repo } = setup();
    try {
      expect(await repo.importIntoEmpty([fixture(), fixture('two')])).toBe(2);
      expect(await repo.get('one')).toEqual(fixture());
      await expect(repo.importIntoEmpty([fixture('third')])).rejects.toThrow('NOT_EMPTY');
      expect((await repo.list()).map((r) => r.id)).toEqual(['one', 'two']);
    } finally {
      db.close();
    }
  });
  it('validates the entire snapshot before any write and rejects duplicate IDs', async () => {
    const { db, repo } = setup();
    try {
      await expect(
        repo.importIntoEmpty([fixture(), { ...fixture('bad'), schemaVersion: 99 }]),
      ).rejects.toThrow();
      await expect(repo.importIntoEmpty([fixture(), fixture()])).rejects.toThrow('DUPLICATE_ID');
      expect(await repo.list()).toEqual([]);
      expect(await repo.importIntoEmpty([])).toBe(0);
    } finally {
      db.close();
    }
  });
  it('rolls back every row when a SQL trigger fails on a later record', async () => {
    const { db, repo } = setup();
    try {
      await repo.list();
      db.exec(
        "CREATE TRIGGER reject_second BEFORE INSERT ON patturn_projects WHEN NEW.id = 'two' BEGIN SELECT RAISE(ABORT, 'failure'); END",
      );
      await expect(repo.importIntoEmpty([fixture(), fixture('two')])).rejects.toThrow(
        'IMPORT_FAILED',
      );
      expect(await repo.list()).toEqual([]);
      db.exec('DROP TRIGGER reject_second');
      expect(await repo.importIntoEmpty([fixture(), fixture('two')])).toBe(2);
    } finally {
      db.close();
    }
  });
  it('does not overwrite a competing insert between initialization and import', async () => {
    const { db, driver, repo } = setup();
    try {
      await repo.list();
      const racing = new SqliteProjectRepo({
        ...driver,
        select: async (query, params) => {
          if (query.startsWith('INSERT INTO')) await repo.save(fixture('competitor'));
          return driver.select(query, params);
        },
      });
      await expect(racing.importIntoEmpty([fixture()])).rejects.toThrow('NOT_EMPTY');
      expect((await repo.list()).map((r) => r.id)).toEqual(['competitor']);
    } finally {
      db.close();
    }
  });
});

describe('External project copy import', () => {
  it('retains original and creates an independent identity from a colliding archive', async () => {
    const { db, repo } = setup();
    try {
      await repo.save(fixture());
      const copy = await repo.importCopy(fixture());
      expect(copy.id).not.toBe('one');
      expect(copy.createdAt).not.toBe(date);
      expect(await repo.get('one')).toEqual(fixture());
      expect(await repo.list()).toHaveLength(2);
    } finally {
      db.close();
    }
  });
  it('rejects UUID collision without changing the destination', async () => {
    const { db, repo } = setup();
    await repo.save(fixture());
    const uuid = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValue('one' as ReturnType<typeof crypto.randomUUID>);
    try {
      await expect(repo.importCopy(fixture('external'))).rejects.toThrow('ID_CONFLICT');
      expect(await repo.list()).toEqual([fixture()]);
    } finally {
      uuid.mockRestore();
      db.close();
    }
  });
});

describe('Opened snapshot conditional update', () => {
  it('updates the expected snapshot but rejects stale, deleted and changed identity', async () => {
    const { db, repo } = setup();
    try {
      const original = fixture();
      await repo.save(original);
      const next = fixture('one', 'تغییر');
      await repo.updateIfUnchanged(original, next);
      expect(await repo.get('one')).toEqual(next);
      await expect(repo.updateIfUnchanged(original, original)).rejects.toThrow('CONFLICT');
      await expect(repo.updateIfUnchanged(next, fixture('other'))).rejects.toThrow('IDENTITY');
      await repo.delete('one');
      await expect(repo.updateIfUnchanged(next, original)).rejects.toThrow('CONFLICT');
      expect(await repo.list()).toEqual([]);
    } finally {
      db.close();
    }
  });
  it('rejects another writer racing between read and conditional update', async () => {
    const { db, repo, driver } = setup();
    try {
      await repo.save(fixture());
      const racing = new SqliteProjectRepo({
        ...driver,
        select: async (query, params) => {
          if (query.startsWith('update ')) await repo.save(fixture('one', 'رقیب'));
          return driver.select(query, params);
        },
      });
      await expect(racing.updateIfUnchanged(fixture(), fixture('one', 'محلی'))).rejects.toThrow(
        'CONFLICT',
      );
      expect(await repo.get('one')).toEqual(fixture('one', 'رقیب'));
    } finally {
      db.close();
    }
  });
});

it('never normalizes away unsupported nested stored fields on reads, saves or conditional updates', async () => {
  const { db, repo } = setup();
  try {
    await repo.save(fixture());
    const record = {
      ...fixture(),
      data: {
        ...(fixture().data as object),
        settings: { unit: 'mm', shrink: 0.12, wallThickness: 4, futureOption: 7 },
      },
    };
    const raw = JSON.stringify(record);
    db.prepare('update patturn_projects set document = ?').run(raw);
    await expect(repo.get('one')).rejects.toThrow();
    await expect(repo.list()).rejects.toThrow();
    await expect(repo.save(fixture())).rejects.toThrow();
    await expect(repo.updateIfUnchanged(fixture(), fixture())).rejects.toThrow();
    expect(db.prepare('select document from patturn_projects').get()!.document).toBe(raw);
  } finally {
    db.close();
  }
});

it('conditionally deletes only the listed revision and rejects a racing SQL update', async () => {
  const { db, repo, driver } = setup();
  try {
    await repo.save(fixture());
    await repo.save(fixture('two'));
    const racing = new SqliteProjectRepo({
      ...driver,
      select: async (query, params) => {
        if (query.startsWith('delete from')) await repo.save(fixture('one', 'رقیب'));
        return driver.select(query, params);
      },
    });
    await expect(racing.deleteIfUnchanged(fixture())).rejects.toThrow('CONFLICT');
    await expect(repo.deleteIfUnchanged(fixture())).rejects.toThrow('CONFLICT');
    expect(await repo.get('one')).toEqual(fixture('one', 'رقیب'));
    await repo.deleteIfUnchanged(fixture('one', 'رقیب'));
    await expect(repo.deleteIfUnchanged(fixture())).rejects.toThrow('CONFLICT');
    expect((await repo.list()).map((r) => r.id)).toEqual(['two']);
  } finally {
    db.close();
  }
});
