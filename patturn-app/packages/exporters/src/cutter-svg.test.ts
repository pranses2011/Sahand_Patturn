import { expect, it } from 'vitest';
import { toCutterSvg } from './cutter-svg.js';
import type { CutterPoint } from '@patturn/kernel';
const square: CutterPoint[] = [
  [10, 20],
  [50, 20],
  [50, 80],
  [10, 80],
];
const decode = (points: readonly CutterPoint[]) =>
  new TextDecoder().decode(toCutterSvg(points).bytes);
it('exports a deterministic polygon with explicit mm dimensions and no unsupported markup', () => {
  const before = JSON.stringify(square);
  const result = toCutterSvg(square);
  expect(result.ok).toBe(true);
  expect(result.filename).toBe('convex-cutter_contour_W40-D60mm.svg');
  expect(decode(square)).toBe(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="60mm" viewBox="0 0 40 60"><polygon points="0,0 40,0 40,60 0,60"/></svg>\n',
  );
  expect(toCutterSvg(square)).toEqual(result);
  expect(JSON.stringify(square)).toBe(before);
});
it('preserves fractional coordinates without rounding, and removes only the repeated closing vertex', () => {
  const points: CutterPoint[] = [
    [-10.25, -20.5],
    [20.125, -20.5],
    [20.125, 40.75],
    [-10.25, 40.75],
    [-10.25, -20.5],
  ];
  expect(decode(points)).toContain('width="30.375mm" height="61.25mm"');
  expect(decode(points)).toContain('points="0,0 30.375,0 30.375,61.25 0,61.25"');
});
it('accepts reversed winding without changing the input ordering', () => {
  expect(decode([...square].reverse())).toContain('points="0,60 40,60 40,0 0,0"');
});
it.each([
  { points: [] },
  {
    points: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
  },
  {
    points: [
      [0, 0],
      [40, 0],
      [20, 10],
      [40, 40],
      [0, 40],
    ],
  },
  {
    points: [
      [0, 0],
      [40, 40],
      [0, 40],
      [40, 0],
    ],
  },
  {
    points: [
      [0, 0],
      [40, 0],
      [40, 0],
      [0, 40],
    ],
  },
  {
    points: [
      [0, 0],
      [Infinity, 0],
      [0, 40],
    ],
  },
  {
    points: [
      [0, 0],
      [NaN, 0],
      [0, 40],
    ],
  },
  {
    points: [
      [0, 0],
      [151, 0],
      [151, 40],
      [0, 40],
    ],
  },
  {
    points: [
      ['"/><script/>', 0],
      [40, 0],
      [0, 40],
    ],
  },
])('rejects invalid or unsafe contours without output bytes %#', ({ points }) => {
  const result = toCutterSvg(points as unknown as CutterPoint[]);
  expect(result.ok).toBe(false);
  expect(result.bytes).toBeUndefined();
  expect(result.error).toBe('CUTTER_SVG_INVALID_CONTOUR');
});
