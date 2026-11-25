import { expect, it } from 'vitest';
import { buildOrthogonalCutter, validateMesh, type CutterPoint } from '@patturn/kernel';
import { toBinaryStl, toOrthogonalCutterSvg } from './index.js';
it('exports the experimental L-shaped cutter as validated mm STL without capping its opening', () => {
  const points: CutterPoint[] = [
    [0, 0],
    [80, 0],
    [80, 30],
    [30, 30],
    [30, 80],
    [0, 80],
  ];
  const mesh = buildOrthogonalCutter(points, { heightMm: 20, wallMm: 1.6, tipMm: 0.6 });
  const result = toBinaryStl(mesh, 'orthogonal-cutter');
  expect(result.ok).toBe(true);
  expect(result.validation?.euler).toBe(0);
  const bytes = result.bytes!;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(80, true)).toBe(84);
  expect(bytes.length).toBe(84 + 84 * 50);
  let minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < 84; i++)
    for (let j = 0; j < 3; j++) {
      const y = view.getFloat32(84 + i * 50 + 16 + j * 12, true);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  expect(minY).toBe(0);
  expect(maxY).toBe(20);
  expect(validateMesh(mesh).signedVolumeMm3).toBeGreaterThan(0);
});

it('exports re-importable orthogonal SVG with physical mm and no convexification or rounding', () => {
  const points: CutterPoint[] = [
    [10.25, 20.5],
    [90.25, 20.5],
    [90.25, 50.5],
    [40.25, 50.5],
    [40.25, 100.5],
    [10.25, 100.5],
  ];
  const before = JSON.stringify(points);
  const result = toOrthogonalCutterSvg(points);
  expect(result.ok).toBe(true);
  expect(result.filename).toBe('orthogonal-cutter_contour_W80-D80mm.svg');
  expect(new TextDecoder().decode(result.bytes)).toBe(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="80mm" viewBox="0 0 80 80"><polygon points="0,0 80,0 80,30 30,30 30,80 0,80"/></svg>\n',
  );
  expect(toOrthogonalCutterSvg(points)).toEqual(result);
  expect(JSON.stringify(points)).toBe(before);
});
it('uses minimum supported width for contour-only SVG and rejects unsafe or diagonal contours', () => {
  const notch: CutterPoint[] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [56, 100],
    [56, 40],
    [44, 40],
    [44, 100],
    [0, 100],
  ];
  expect(toOrthogonalCutterSvg(notch).ok).toBe(true);
  expect(
    toOrthogonalCutterSvg([
      [0, 0],
      [80, 0],
      [80, 80],
      [30, 30],
      [0, 80],
    ]).ok,
  ).toBe(false);
  expect(
    toOrthogonalCutterSvg([
      [0, 0],
      [Infinity, 0],
      [80, 80],
      [0, 80],
    ]).bytes,
  ).toBeUndefined();
});
