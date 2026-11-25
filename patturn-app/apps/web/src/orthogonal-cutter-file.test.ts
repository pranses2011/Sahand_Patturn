import { expect, it } from 'vitest';
import {
  readOrthogonalCutterFile,
  writeOrthogonalCutterFile,
  validateOrthogonalCutterFile,
  type OrthogonalCutterFile,
} from './orthogonal-cutter-file';
import { readCutterFile } from './cutter-file';
const doc: OrthogonalCutterFile = {
  format: 'patturn-orthogonal-cutter',
  version: 1,
  units: 'mm',
  heightMm: 25,
  wallMm: 2,
  tipMm: 0.8,
  points: [
    [10.25, 20.5],
    [90.25, 20.5],
    [90.25, 50.5],
    [40.25, 50.5],
    [40.25, 100.5],
    [10.25, 100.5],
  ],
};
it('round trips a deterministic independent fractional snapshot with all cutter dimensions', () => {
  const bytes = writeOrthogonalCutterFile(doc),
    before = JSON.stringify(doc);
  const copy = readOrthogonalCutterFile(new TextDecoder().decode(bytes));
  expect(copy).toEqual(doc);
  expect(copy).not.toBe(doc);
  expect(copy.points[0]).not.toBe(doc.points[0]);
  expect(writeOrthogonalCutterFile(doc)).toEqual(bytes);
  expect(JSON.stringify(doc)).toBe(before);
});
it.each([
  null,
  [],
  {},
  { ...doc, version: 2 },
  { ...doc, units: 'cm' },
  { ...doc, format: 'patturn-cutter' },
  { ...doc, extra: true },
  { ...doc, heightMm: '25' },
  { ...doc, heightMm: Infinity },
  { ...doc, heightMm: 41 },
  { ...doc, wallMm: 0.8, tipMm: 1.2 },
  { ...doc, points: [] },
  {
    ...doc,
    points: [
      [0, 0],
      [80, 0],
      [80, 80],
      [30, 30],
      [0, 80],
    ],
  },
  {
    ...doc,
    points: [
      [0, 0],
      [Infinity, 0],
      [80, 80],
      [0, 80],
    ],
  },
  {
    ...doc,
    points: [
      [0, 0],
      [100, 0],
      [100, 100],
      [53, 100],
      [53, 30],
      [47, 30],
      [47, 100],
      [0, 100],
    ],
  },
])(
  'rejects malformed, future, mixed-format or unsafe data without silently changing it %#',
  (input) => {
    expect(() => validateOrthogonalCutterFile(input)).toThrow();
  },
);
it('enforces UTF-8 byte and JSON syntax limits, and keeps the convex v1 contract separate', () => {
  for (const text of ['{', '{}{}']) expect(() => readOrthogonalCutterFile(text)).toThrow();
  for (const text of [' '.repeat(65537), ' '.repeat(30000) + 'ا'.repeat(20000)])
    expect(() => readOrthogonalCutterFile(text)).toThrow('ORTHOGONAL_FILE_TOO_LARGE');
  expect(() => readCutterFile(new TextDecoder().decode(writeOrthogonalCutterFile(doc)))).toThrow();
  expect(() => writeOrthogonalCutterFile({ ...doc, wallMm: 0.1 })).toThrow();
});
