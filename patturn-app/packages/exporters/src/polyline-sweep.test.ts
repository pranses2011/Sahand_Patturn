import { expect, it } from 'vitest';
import { buildPolylineSweep } from '@patturn/kernel';
import { toBinaryStl } from './index';
it('exports the bounded nonplanar sweep as finite validated mm STL with both caps', () => {
  const mesh = buildPolylineSweep({
    path: [
      [0, 0, 0],
      [0, 80, 0],
      [40, 140, 20],
      [100, 180, 60],
    ],
    tubeRadius: 8,
    segments: 48,
  });
  const output = toBinaryStl(mesh, 'polyline-sweep');
  expect(output.ok, output.error).toBe(true);
  expect(output.validation?.openEdges).toBe(0);
  expect(output.validation?.nonManifoldVertices).toBe(0);
  const bytes = output.bytes!,
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(80, true)).toBe(384);
  expect(bytes.length).toBe(84 + 384 * 50);
  let invalid = 0;
  for (let i = 0; i < 384; i++)
    for (let c = 0; c < 12; c++)
      if (!Number.isFinite(view.getFloat32(84 + i * 50 + c * 4, true))) invalid++;
  expect(invalid).toBe(0);
  expect(toBinaryStl(mesh, 'polyline-sweep')).toEqual(output);
});
