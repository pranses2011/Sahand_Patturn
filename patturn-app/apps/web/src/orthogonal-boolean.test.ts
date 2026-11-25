import { expect, it } from 'vitest';
import { editOrthogonalRectangle as edit } from './orthogonal-boolean';
import { buildOrthogonalCutter, validateMesh, type CutterPoint } from '@patturn/kernel';
const square: CutterPoint[] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ],
  options = { heightMm: 20, wallMm: 1.6, tipMm: 0.6 };
it.each(['union', 'difference', 'intersection'] as const)(
  'validates the entire %s result as a cutter',
  (op) => {
    const result = edit(square, { x: 80, y: 20, width: 40, height: 40 }, op, options);
    expect(validateMesh(buildOrthogonalCutter(result, options)).ok).toBe(true);
  },
);
it.each([
  { op: 'difference' as const, rect: { x: 20, y: 20, width: 20, height: 20 } },
  { op: 'difference' as const, rect: { x: 40, y: -10, width: 20, height: 120 } },
  { op: 'union' as const, rect: { x: 120, y: 0, width: 20, height: 20 } },
  { op: 'intersection' as const, rect: { x: 120, y: 0, width: 20, height: 20 } },
])('rejects holes, split and empty results %#', ({ op, rect }) => {
  expect(() => edit(square, rect, op, options)).toThrow('SINGLE_CONTOUR');
});
it('rejects insufficient clearance, oversized bounds and invalid actual dimensions', () => {
  expect(() => edit(square, { x: 80, y: 20, width: 40, height: 6 }, 'union', options)).toThrow();
  expect(() => edit(square, { x: 80, y: 20, width: 100, height: 40 }, 'union', options)).toThrow();
  expect(() =>
    edit(square, { x: 80, y: 20, width: 40, height: 40 }, 'union', { ...options, heightMm: NaN }),
  ).toThrow();
});
