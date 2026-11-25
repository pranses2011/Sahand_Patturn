import { expect, it } from 'vitest';
import {
  editOrthogonalPolygon as edit,
  translateBooleanOperand as translate,
  previewOrthogonalPolygon as preview,
} from './orthogonal-boolean';
import { buildOrthogonalCutter, validateMesh, type CutterPoint } from '@patturn/kernel';
const square: CutterPoint[] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ],
  l: CutterPoint[] = [
    [80, 20],
    [120, 20],
    [120, 60],
    [100, 60],
    [100, 40],
    [80, 40],
  ],
  options = { heightMm: 20, wallMm: 1.6, tipMm: 0.6 };
it.each(['union', 'difference', 'intersection'] as const)(
  'builds a validated cutter for %s',
  (op) => {
    expect(validateMesh(buildOrthogonalCutter(edit(square, l, op, options), options)).ok).toBe(
      true,
    );
  },
);
it('translates exact decimals without mutating or normalizing the operand', () => {
  const before = JSON.stringify(l);
  expect(translate(l, ['-80.125', '0.25'])[0]).toEqual([-0.125, 20.25]);
  expect(JSON.stringify(l)).toBe(before);
});
it.each([{ v: ['', '0'] }, { v: ['NaN', '0'] }, { v: ['0', '1001'] }, { v: ['0'] }])(
  'rejects partial or invalid offset %#',
  ({ v }) => {
    expect(() => translate(l, v)).toThrow('OFFSET');
    expect(preview(square, l, v, 'union', options).operand).toBeNull();
  },
);
it('retains all rejected rings and blocks holes or disjoint results', () => {
  const inner = translate(l, ['-70', '0']);
  expect(() => edit(square, inner, 'difference', options)).toThrow('SINGLE_CONTOUR');
  const view = preview(square, inner, ['0', '0'], 'difference', options);
  expect(view.valid).toBe(false);
  expect(view.contours).toHaveLength(2);
  expect(() => edit(square, translate(l, ['200', '0']), 'union', options)).toThrow(
    'SINGLE_CONTOUR',
  );
});
it('revalidates dimensions and returns no stale candidate when the operand disappears', () => {
  const view = preview(square, l, ['0', '0'], 'union', { ...options, heightMm: NaN });
  expect(view.valid).toBe(false);
  expect(view.contours).toHaveLength(1);
  const gone = preview(square, null, ['0', '0'], 'union', options);
  expect(gone.operand).toBeNull();
  expect(gone.contours).toEqual([]);
  expect(gone.valid).toBe(false);
});
