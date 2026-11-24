import { expect, it } from 'vitest';
import { validatedProjectRecord } from './project-record.js';
import { parseProject, serializeProject } from './index.js';
const time = '2020-01-01T00:00:00.000Z';
function fixture() {
  return {
    id: 'strict',
    name: 'کامل',
    schemaVersion: 3,
    createdAt: time,
    updatedAt: time,
    data: {
      schemaVersion: 3,
      name: 'کامل',
      createdAt: time,
      updatedAt: time,
      settings: { unit: 'mm', shrink: 0.12, wallThickness: 4 },
      form: {
        profile: {
          nodes: [
            { x: 0, y: 0, hIn: [0, 0], hOut: [1, 1] },
            { x: 40, y: 100 },
          ],
          closed: true,
        },
        symmetry: { mirrorX: false, mirrorY: false },
        fillLevel: 0.8,
        segments: 96,
        wallThickness: 4,
        footRing: { enabled: true, width: 4, depth: 2, edge: 'square' },
      },
      pattern: {
        baseId: 'grid',
        params: { customNumber: 4, customString: 'آزمون', customBoolean: true },
        tile: { width: 40, height: 40, seamlessX: true, seamlessY: true },
        canvas: { widthMm: 300, heightMm: 300 },
        mapping: { mode: 'cylindrical', seamAt: 0, scale: 1 },
      },
      mold: {
        mode: 'multi',
        parts: 2,
        wallThickness: 25,
        draftAngle: 1.5,
        keys: { type: 'hemisphere', size: 8, taper: 4, tolerance: 0.2, count: 4 },
        mother: { enabled: true, kind: 'print', flangeMm: 5 },
        horizontalSplits: [50],
      },
    },
  };
}
const paths = [
  [],
  ['settings'],
  ['form'],
  ['form', 'profile'],
  ['form', 'profile', 'nodes', 0],
  ['form', 'symmetry'],
  ['form', 'footRing'],
  ['pattern'],
  ['pattern', 'tile'],
  ['pattern', 'canvas'],
  ['pattern', 'mapping'],
  ['mold'],
  ['mold', 'keys'],
  ['mold', 'mother'],
];
it.each(paths.map((path) => ({ path })))(
  'rejects unknown nested data without silently stripping it: $path',
  ({ path }) => {
    const record = fixture();
    let target: unknown = record.data;
    for (const key of path) target = (target as Record<string | number, unknown>)[key];
    (target as Record<string, unknown>).futureOption = { value: 42 };
    const before = JSON.stringify(record);
    expect(() => validatedProjectRecord(record)).toThrow();
    expect(() => serializeProject(record)).toThrow();
    expect(() =>
      parseProject(JSON.stringify({ format: 'patturn', v: 1, project: record })),
    ).toThrow();
    expect(JSON.stringify(record)).toBe(before);
  },
);
it('retains every supported general parameter including handles, mapping and open-ended pattern params', () => {
  const record = fixture();
  expect(validatedProjectRecord(record)).toEqual(record);
  expect(parseProject(serializeProject(record))).toEqual(record);
});
it('does not discard supplied version-one settings during migration', () => {
  const record = fixture();
  record.schemaVersion = 1;
  record.data.schemaVersion = 1;
  record.data.settings.shrink = 0.2;
  const parsed = validatedProjectRecord(record);
  expect(parsed.data).toMatchObject({ schemaVersion: 3, settings: { shrink: 0.2 } });
  (record.data.settings as Record<string, unknown>).unknownUnit = 'cm';
  expect(() => validatedProjectRecord(record)).toThrow();
});
it('rejects unknown archive envelope properties rather than ignoring them', () => {
  expect(() =>
    parseProject(
      JSON.stringify({ format: 'patturn', v: 1, project: fixture(), futureOption: true }),
    ),
  ).toThrow('NOT_PATTURN_FILE');
});
