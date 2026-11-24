import { expect, it } from 'vitest';
import { buildCircularCutter } from '@patturn/kernel';
import { toBinaryStl } from './index.js';
it('exports the exact validated closed cutter in binary STL without caps across its opening', () => {
  const mesh = buildCircularCutter({ diameterMm: 60, heightMm: 20, wallMm: 1.6, tipMm: 0.6 });
  const result = toBinaryStl(mesh, 'cutter');
  expect(result.ok).toBe(true);
  const view = new DataView(result.bytes!.buffer);
  const count = view.getUint32(80, true);
  expect(count).toBe(mesh.indices.length / 3);
  expect(result.bytes!.length).toBe(84 + count * 50);
  for (let triangle = 0; triangle < count; triangle++)
    for (let corner = 0; corner < 3; corner++) {
      const offset = 84 + triangle * 50 + 12 + corner * 12;
      const x = view.getFloat32(offset, true),
        y = view.getFloat32(offset + 4, true),
        z = view.getFloat32(offset + 8, true);
      expect(Math.hypot(x, z)).toBeGreaterThan(29.999);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(20);
      for (let axis = 0; axis < 3; axis++)
        expect(view.getFloat32(offset + axis * 4, true)).toBe(
          mesh.positions[mesh.indices[triangle * 3 + corner]! * 3 + axis],
        );
    }
});
