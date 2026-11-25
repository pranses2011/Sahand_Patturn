import { expect, it } from 'vitest';
import {
  booleanOrthogonalRectangle as edit,
  type RectangleBooleanOperation,
} from './rectangle-boolean';
import { detectIslands, type ContourPoint } from './islands';
const square: ContourPoint[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];
const area = (c: ContourPoint[][]) =>
  detectIslands(c).reduce((sum, item) => sum + item.areaMm2 * (item.depth % 2 ? -1 : 1), 0);
it.each(['union', 'difference', 'intersection'] as const)(
  'is deterministic and immutable for %s in both windings',
  (op) => {
    for (const input of [square, [...square].reverse()]) {
      const before = JSON.stringify(input),
        r = { x: 80, y: 20, width: 40, height: 40 },
        result = edit(input, r, op);
      expect(result).toHaveLength(1);
      expect(area(result)).toBe(op === 'union' ? 10800 : op === 'difference' ? 9200 : 800);
      expect(edit(input, r, op)).toEqual(result);
      expect(JSON.stringify(input)).toBe(before);
      for (const p of result[0]!) expect(input.includes(p)).toBe(false);
    }
  },
);
it('retains holes and every disconnected region instead of selecting a largest polygon', () => {
  const hole = edit(square, { x: 20, y: 20, width: 20, height: 20 }, 'difference');
  expect(hole).toHaveLength(2);
  expect(area(hole)).toBe(9600);
  expect(detectIslands(hole).filter((i) => i.isIsland)).toHaveLength(1);
  const split = edit(square, { x: 40, y: -10, width: 20, height: 120 }, 'difference');
  expect(split).toHaveLength(2);
  expect(area(split)).toBe(8000);
  expect(edit(square, { x: 120, y: 0, width: 20, height: 20 }, 'union')).toHaveLength(2);
});
it('returns an explicit empty result on disjoint intersection or complete removal', () => {
  expect(edit(square, { x: 120, y: 0, width: 20, height: 20 }, 'intersection')).toEqual([]);
  expect(edit(square, { x: 0, y: 0, width: 100, height: 100 }, 'difference')).toEqual([]);
});
it('preserves fractional coordinates and simplifies only collinear vertices', () => {
  const result = edit(square, { x: 80.125, y: 20.25, width: 40.5, height: 40.75 }, 'union');
  expect(result.flat().some((p) => p[0] === 120.625)).toBe(true);
  expect(result.flat().some((p) => p[1] === 61)).toBe(true);
  for (const ring of result)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!,
        b = ring[(i + 1) % ring.length]!,
        c = ring[(i + 2) % ring.length]!;
      expect((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])).toBe(false);
    }
});
it('rejects ambiguous point-touching unions', () => {
  expect(() => edit(square, { x: 100, y: 100, width: 20, height: 20 }, 'union')).toThrow();
});
it.each([
  { x: NaN, y: 0, width: 20, height: 20 },
  { x: 0, y: Infinity, width: 20, height: 20 },
  { x: 1001, y: 0, width: 20, height: 20 },
  { x: 0, y: 0, width: 0, height: 20 },
  { x: 0, y: 0, width: 20, height: -1 },
  { x: 0, y: 0, width: 151, height: 20 },
])('rejects invalid rectangles %#', (rect) => {
  expect(() => edit(square, rect, 'difference')).toThrow('RECTANGLE');
});
it('rejects diagonal, crossing, duplicate and oversized inputs and unknown operations', () => {
  expect(() =>
    edit(
      [
        [0, 0],
        [80, 0],
        [40, 80],
        [0, 40],
      ],
      { x: 0, y: 0, width: 20, height: 20 },
      'union',
    ),
  ).toThrow('AXIS');
  expect(() =>
    edit([...square, square[0]!], { x: 0, y: 0, width: 20, height: 20 }, 'union'),
  ).toThrow();
  expect(() =>
    edit(
      Array.from({ length: 65 }, () => square[0]!),
      { x: 0, y: 0, width: 20, height: 20 },
      'union',
    ),
  ).toThrow('INPUT');
  expect(() =>
    edit(square, { x: 0, y: 0, width: 20, height: 20 }, 'bad' as RectangleBooleanOperation),
  ).toThrow('OPERATION');
});
