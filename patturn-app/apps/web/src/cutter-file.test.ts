import { expect, it } from 'vitest';
import {
  readCutterFile,
  writeCutterFile,
  validateCutterFile,
  type CutterFile,
} from './cutter-file';
const circle: CutterFile = {
  format: 'patturn-cutter',
  version: 1,
  units: 'mm',
  heightMm: 25,
  wallMm: 2,
  tipMm: 0.8,
  shape: { kind: 'circle', diameterMm: 80 },
};
const polygon: CutterFile = {
  ...circle,
  shape: {
    kind: 'polygon',
    points: [
      [10.25, 20.5],
      [70.625, 20.5],
      [70.625, 81.75],
      [10.25, 81.75],
    ],
  },
};
it.each([circle, polygon])(
  'round trips settings and contour with deterministic JSON and independent snapshots',
  (doc) => {
    const bytes = writeCutterFile(doc);
    expect(writeCutterFile(doc)).toEqual(bytes);
    const decoded = readCutterFile(new TextDecoder().decode(bytes));
    expect(decoded).toEqual(doc);
    expect(decoded).not.toBe(doc);
    expect(decoded.shape).not.toBe(doc.shape);
    if (doc.shape.kind === 'polygon' && decoded.shape.kind === 'polygon') {
      expect(decoded.shape.points[0]).not.toBe(doc.shape.points[0]);
    }
  },
);
it.each([
  null,
  [],
  {},
  { ...circle, version: 2 },
  { ...circle, units: 'cm' },
  { ...circle, format: 'project' },
  { ...circle, extra: 1 },
  { ...circle, heightMm: '25' },
  { ...circle, heightMm: NaN },
  { ...circle, heightMm: 41 },
  { ...circle, wallMm: 0.5 },
  { ...circle, wallMm: 0.8, tipMm: 1.2 },
  { ...circle, shape: { kind: 'circle', diameterMm: 80, extra: 1 } },
  { ...circle, shape: { kind: 'circle', diameterMm: 151 } },
  { ...circle, shape: { kind: 'other', points: [] } },
  {
    ...circle,
    shape: {
      kind: 'polygon',
      points: [
        [0, 0],
        [40, 0],
        [20, 10],
        [40, 40],
        [0, 40],
      ],
    },
  },
  {
    ...circle,
    shape: {
      kind: 'polygon',
      points: [
        [0, 0, 3],
        [40, 0],
        [0, 40],
      ],
    },
  },
  {
    ...circle,
    shape: {
      kind: 'polygon',
      points: [
        [0, 0],
        [Infinity, 0],
        [0, 40],
      ],
    },
  },
  { ...circle, shape: { kind: 'polygon', points: [] } },
  { ...circle, shape: { kind: 'polygon', points: Array.from({ length: 66 }, () => [0, 0]) } },
])(
  'rejects malformed, future and unsupported documents without silently stripping fields %#',
  (doc) => {
    expect(() => validateCutterFile(doc)).toThrow();
  },
);
it('enforces the UTF-8 byte limit before parsing, and refuses malformed or trailing JSON', () => {
  for (const text of ['{', '{}{}', ' '.repeat(65537), ' '.repeat(30000) + 'ا'.repeat(20000)])
    expect(() => readCutterFile(text)).toThrow();
});
it('refuses unsafe writer input rather than serializing an invalid snapshot', () => {
  expect(() => writeCutterFile({ ...circle, heightMm: Infinity })).toThrow();
});
