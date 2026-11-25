import { expect, it } from 'vitest';
import {
  booleanOrthogonalPolygons as edit,
  booleanOrthogonalRectangle as rect,
} from './rectangle-boolean';
import { detectIslands, type ContourPoint } from './islands';
const square: ContourPoint[] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ],
  l: ContourPoint[] = [
    [80, 20],
    [120, 20],
    [120, 60],
    [100, 60],
    [100, 40],
    [80, 40],
  ];
const area = (c: ContourPoint[][]) =>
  detectIslands(c).reduce((s, i) => s + i.areaMm2 * (i.depth % 2 ? -1 : 1), 0);
it.each(['union', 'difference', 'intersection'] as const)(
  'supports concave operands in either winding for %s',
  (op) => {
    for (const a of [square, [...square].reverse()])
      for (const b of [l, [...l].reverse()]) {
        const before = JSON.stringify({ a, b }),
          result = edit(a, b, op);
        expect(area(result)).toBe(op === 'union' ? 10800 : op === 'difference' ? 9600 : 400);
        expect(JSON.stringify({ a, b })).toBe(before);
        expect(edit(a, b, op)).toEqual(result);
      }
  },
);
it('preserves holes and disconnected pieces for polygon operands', () => {
  const inside: ContourPoint[] = [
    [20, 20],
    [60, 20],
    [60, 40],
    [40, 40],
    [40, 60],
    [20, 60],
  ];
  const result = edit(square, inside, 'difference');
  expect(result).toHaveLength(2);
  expect(detectIslands(result).filter((i) => i.isIsland)).toHaveLength(1);
  expect(
    edit(
      square,
      l.map(([x, y]) => [x + 200, y]),
      'union',
    ),
  ).toHaveLength(2);
});
it('keeps rectangle behavior identical after delegation', () => {
  const r = { x: 80, y: 20, width: 40, height: 40 };
  for (const op of ['union', 'difference', 'intersection'] as const)
    expect(rect(square, r, op)).toEqual(
      edit(
        square,
        [
          [80, 20],
          [120, 20],
          [120, 60],
          [80, 60],
        ],
        op,
      ),
    );
});
it('preserves fractional vertices without rescaling or rounding', () => {
  const shifted = l.map(([x, y]): ContourPoint => [x + 0.125, y + 0.25]);
  const result = edit(square, shifted, 'union');
  expect(result.flat().some((p) => p[0] === 120.125 && p[1] === 20.25)).toBe(true);
});
it.each([
  { p: [] },
  {
    p: [
      [0, 0],
      [40, 0],
      [20, 40],
      [0, 40],
    ],
  },
  {
    p: [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
      [0, 0],
    ],
  },
  { p: Array.from({ length: 65 }, () => [0, 0]) },
])('rejects invalid operand %#', ({ p }) => {
  expect(() =>
    edit(
      square,
      p.map(([x, y]): ContourPoint => [x!, y!]),
      'union',
    ),
  ).toThrow();
});
