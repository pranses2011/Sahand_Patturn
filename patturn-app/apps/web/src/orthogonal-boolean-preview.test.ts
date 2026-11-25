import { expect, it } from 'vitest';
import {
  parseBooleanRectangle as parse,
  previewOrthogonalRectangle as preview,
  editOrthogonalRectangle as edit,
} from './orthogonal-boolean';
import type { CutterPoint } from '@patturn/kernel';
const points: CutterPoint[] = [
    [10, 20],
    [110, 20],
    [110, 120],
    [10, 120],
  ],
  options = { heightMm: 20, wallMm: 1.6, tipMm: 0.6 };
it('shows exact real coordinates and the entire rectangle with a safe padded viewport', () => {
  const result = preview(points, ['90.125', '40.25', '40.5', '40.75'], 'union', options);
  expect(result.rectangle).toEqual({ x: 90.125, y: 40.25, width: 40.5, height: 40.75 });
  expect(result.valid).toBe(true);
  expect(result.contours[0]).toEqual(edit(points, result.rectangle!, 'union', options));
  expect(result.box).toEqual({ x: 5, y: 15, width: 130.625, height: 110 });
});
it.each([
  { op: 'difference' as const, v: ['30', '40', '20', '20'], count: 2 },
  { op: 'difference' as const, v: ['50', '10', '20', '120'], count: 2 },
  { op: 'union' as const, v: ['130', '20', '20', '20'], count: 2 },
  { op: 'intersection' as const, v: ['130', '20', '20', '20'], count: 0 },
])('keeps rejected holes, disjoint regions and empty results explicit %#', ({ op, v, count }) => {
  const result = preview(points, v, op, options);
  expect(result.valid).toBe(false);
  expect(result.contours).toHaveLength(count);
  expect(result.rectangle).not.toBeNull();
});
it('keeps candidate rings visible when current wall or height validation fails', () => {
  const result = preview(points, ['90', '40', '40', '40'], 'union', { ...options, heightMm: NaN });
  expect(result.valid).toBe(false);
  expect(result.contours).toHaveLength(1);
});
it.each(
  [
    ['', '0', '20', '20'],
    ['0', 'NaN', '20', '20'],
    ['0', '0', '0', '20'],
    ['0', '0', '20', '151'],
    ['1001', '0', '20', '20'],
    ['0', '0', '20'],
  ].map((v) => ({ v })),
)('does not draw invalid or partial rectangle %#', ({ v }) => {
  expect(() => parse(v)).toThrow();
  const result = preview(points, v, 'union', options);
  expect(result.rectangle).toBeNull();
  expect(result.contours).toEqual([]);
  expect(result.valid).toBe(false);
  expect(Object.values(result.box).every(Number.isFinite)).toBe(true);
});
it('never mutates source or values and remains deterministic across recomputation', () => {
  const v = ['90', '40', '40', '40'],
    before = JSON.stringify({ points, v });
  const first = preview(points, v, 'union', options);
  expect(preview(points, v, 'union', options)).toEqual(first);
  expect(JSON.stringify({ points, v })).toBe(before);
});
