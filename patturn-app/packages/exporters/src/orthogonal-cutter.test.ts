import { expect, it } from 'vitest';
import { buildOrthogonalCutter, validateMesh, type CutterPoint } from '@patturn/kernel';
import { toBinaryStl } from './index.js';
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
