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
