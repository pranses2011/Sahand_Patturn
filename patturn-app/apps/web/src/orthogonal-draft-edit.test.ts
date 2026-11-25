import { expect, it } from 'vitest';
import {
  editOrthogonalDraftPoint as edit,
  closeOrthogonalSketch as close,
} from './orthogonal-sketch';
import type { CutterPoint } from '@patturn/kernel';
const square: CutterPoint[] = [
    [0, 0],
    [80, 0],
    [80, 60],
    [0, 60],
  ],
  options = { heightMm: 20, wallMm: 1.6, tipMm: 0.6 };
it('allows explicit temporary diagonal drafts but never commits them silently', () => {
  const changed = edit(square, 1, 'replace', [90.125, 10.25]);
  expect(changed[1]).toEqual([90.125, 10.25]);
  expect(() => close(changed, options)).toThrow();
  expect(square[1]).toEqual([80, 0]);
});
it('can insert two arbitrary corners then repair and close with current clearance', () => {
  let p = edit(square, 1, 'insertAfter', [100, 0]);
  p = edit(p, 2, 'insertAfter', [100, 60]);
  p = edit(p, 2, 'replace', [80, 20]);
  p = edit(p, 3, 'replace', [100, 20]);
  p = edit(p, 4, 'replace', [100, 60]);
  expect(close(p, options)).toHaveLength(6);
});
it('deletes any selected point including the first, last and final point without mutating inputs', () => {
  for (const i of [0, 1, 3]) {
    const result = edit(square, i, 'delete');
    expect(result).toEqual(square.filter((_, j) => j !== i));
    expect(result[0]).not.toBe(square[i === 0 ? 1 : 0]);
    expect(() => close(result, options)).toThrow();
  }
  expect(edit([[0, 0]], 0, 'delete')).toEqual([]);
  expect(square).toHaveLength(4);
});
it('preserves fractional coordinates and independent snapshots', () => {
  const coordinate: [number, number] = [80.125, 0];
  const result = edit(square, 1, 'replace', coordinate);
  coordinate[0] = 0;
  expect(result[1]).toEqual([80.125, 0]);
  expect(edit(square, 1, 'replace', [80, 0])).toEqual(square);
});
it.each([-1, 4, 0.5, NaN])('rejects invalid index %j', (index) => {
  expect(() => edit(square, index, 'delete')).toThrow('INDEX');
});
it.each([{ p: [NaN, 0] }, { p: [151, 0] }, { p: [0, -1] }, { p: [0, 60] }])(
  'rejects invalid or duplicate target %#',
  ({ p }) => {
    expect(() => edit(square, 1, 'replace', [p[0]!, p[1]!])).toThrow();
  },
);
it('bounds insertion at 64 and rejects unknown operations', () => {
  const p = Array.from({ length: 64 }, (_, i): CutterPoint => [i, 0]);
  expect(() => edit(p, 0, 'insertAfter', [70, 0])).toThrow('LIMIT');
  expect(() => edit(square, 0, 'bad' as 'delete')).toThrow('OPERATION');
});
