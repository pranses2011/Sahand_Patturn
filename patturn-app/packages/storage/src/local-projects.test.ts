import { expect, it, vi } from 'vitest';
import { LocalRepo, parseProject, serializeProject, type ProjectRecord } from './index.js';
const fixture = (): ProjectRecord => ({
  id: 'one',
  name: 'نمونه',
  schemaVersion: 3,
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2020-01-01T00:00:00.000Z',
  data: {
    schemaVersion: 3,
    name: 'نمونه',
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    settings: { unit: 'mm', wallThickness: 4, shrink: 0.12 },
  },
});
function setup() {
  let raw: string | null = null;
  const source = {
    getItem: () => raw,
    setItem: vi.fn((_key: string, value: string) => {
      raw = value;
    }),
  };
  return {
    source,
    repo: new LocalRepo(() => source),
    setRaw: (value: string) => {
      raw = value;
    },
    raw: () => raw,
  };
}
it('validates browser save/get/list/delete and detaches caller records', async () => {
  const { repo } = setup();
  const record = fixture();
  await repo.save(record);
  record.name = 'changed';
  expect(await repo.get('one')).toEqual(fixture());
  expect(await repo.list()).toHaveLength(1);
  await repo.delete('one');
  expect(await repo.list()).toEqual([]);
});
it('duplicates with independent identity and synchronized document metadata', async () => {
  const { repo } = setup();
  await repo.save(fixture());
  const copy = await repo.duplicate('one', 'کپی');
  expect(copy.id).not.toBe('one');
  expect(copy.data).toMatchObject({ name: 'کپی', createdAt: copy.createdAt });
  expect(await repo.get('one')).toEqual(fixture());
});
it.each(['broken', '{}', JSON.stringify([fixture(), fixture()])])(
  'never overwrites an invalid stored library %#',
  async (raw) => {
    const { repo, setRaw, source } = setup();
    setRaw(raw);
    await expect(repo.save(fixture())).rejects.toThrow();
    await expect(repo.delete('one')).rejects.toThrow();
    expect(source.setItem).not.toHaveBeenCalled();
  },
);
it('preserves previous bytes when browser quota write fails', async () => {
  const { repo, source, raw } = setup();
  await repo.save(fixture());
  const previous = raw();
  source.setItem.mockImplementation(() => {
    throw Error('quota');
  });
  await expect(repo.save({ ...fixture(), id: 'two' })).rejects.toThrow('quota');
  expect(raw()).toBe(previous);
});
it('strictly validates general project archive envelopes and records', () => {
  expect(parseProject(serializeProject(fixture()))).toEqual(fixture());
  for (const text of [
    JSON.stringify({ format: 'patturn', v: 2, project: fixture() }),
    JSON.stringify({ format: 'patturn', v: 1, project: {} }),
    'x'.repeat(512 * 1024 + 1),
  ])
    expect(() => parseProject(text)).toThrow();
});

it('imports a complete snapshot only into an empty browser library', async () => {
  const { repo, raw } = setup();
  expect(await repo.importIntoEmpty([fixture()])).toBe(1);
  const original = raw();
  await expect(repo.importIntoEmpty([{ ...fixture(), id: 'another' }])).rejects.toThrow(
    'NOT_EMPTY',
  );
  expect(raw()).toBe(original);
});
it('rejects invalid/duplicate imports without partial browser writes', async () => {
  const { repo, raw, setRaw } = setup();
  await expect(
    repo.importIntoEmpty([fixture(), { ...fixture(), schemaVersion: 99 }]),
  ).rejects.toThrow();
  await expect(repo.importIntoEmpty([fixture(), fixture()])).rejects.toThrow('DUPLICATE_ID');
  expect(raw()).toBeNull();
  setRaw('broken');
  await expect(repo.importIntoEmpty([fixture()])).rejects.toThrow();
  expect(raw()).toBe('broken');
});

it('imports a detached independent copy without replacing a matching source ID', async () => {
  const { repo } = setup();
  await repo.save(fixture());
  const copy = await repo.importCopy(fixture());
  expect(copy.id).not.toBe('one');
  expect(copy.name).toBe(fixture().name);
  expect(copy.createdAt).not.toBe(fixture().createdAt);
  expect(await repo.get('one')).toEqual(fixture());
  expect(await repo.list()).toHaveLength(2);
});
it('rejects UUID collisions and corrupt browser libraries without writes during copy import', async () => {
  const { repo, raw, setRaw } = setup();
  await repo.save(fixture());
  const before = raw();
  const uuid = vi
    .spyOn(crypto, 'randomUUID')
    .mockReturnValue('one' as ReturnType<typeof crypto.randomUUID>);
  try {
    await expect(repo.importCopy(fixture())).rejects.toThrow('ID_CONFLICT');
    expect(raw()).toBe(before);
  } finally {
    uuid.mockRestore();
  }
  setRaw('broken');
  await expect(repo.importCopy(fixture())).rejects.toThrow();
  expect(raw()).toBe('broken');
});

it('conditionally updates the opened snapshot and rejects stale, deleted or identity-changing writes', async () => {
  const { repo } = setup();
  const original = fixture();
  await repo.save(original);
  const next = {
    ...original,
    name: 'تغییر',
    data: { ...(original.data as object), name: 'تغییر' },
  };
  await repo.updateIfUnchanged(original, next);
  expect(await repo.get('one')).toEqual(next);
  await expect(repo.updateIfUnchanged(original, original)).rejects.toThrow('CONFLICT');
  await expect(repo.updateIfUnchanged(next, { ...next, id: 'other' })).rejects.toThrow('IDENTITY');
  await repo.delete('one');
  await expect(repo.updateIfUnchanged(next, original)).rejects.toThrow('CONFLICT');
  expect(await repo.list()).toEqual([]);
});

it('preserves source bytes containing unsupported nested settings and refuses every implicit rewrite', async () => {
  const { repo, setRaw, raw } = setup();
  const unknown = {
    ...fixture(),
    data: {
      ...(fixture().data as object),
      settings: { unit: 'mm', shrink: 0.12, wallThickness: 4, futureOption: 7 },
    },
  };
  const source = JSON.stringify([unknown]);
  setRaw(source);
  await expect(repo.list()).rejects.toThrow();
  await expect(repo.save(fixture())).rejects.toThrow();
  await expect(repo.importCopy(fixture())).rejects.toThrow();
  expect(raw()).toBe(source);
});
