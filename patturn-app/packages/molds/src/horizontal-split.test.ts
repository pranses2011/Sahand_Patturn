import { beforeAll, describe, expect, it } from 'vitest';
import { revolve, buildChuck, validateMesh } from '@patturn/kernel';
import { initCsg, splitHorizontal } from './csg.js';
beforeAll(async () => {
  await initCsg();
});
const cylinder = () =>
  revolve(
    [
      { r: 0, y: 0 },
      { r: 30, y: 0 },
      { r: 30, y: 80 },
      { r: 0, y: 80 },
    ],
    { segments: 32 },
  );
const bounds = (mesh: ReturnType<typeof cylinder>) => {
  const ys = Array.from(mesh.positions).filter((_, index) => index % 3 === 1);
  return [Math.min(...ys), Math.max(...ys)];
};
describe('Capped horizontal form split', () => {
  it.each([1, 20, 40, 79])('splits a solid cylinder at Y=%s and conserves volume', (height) => {
    const source = cylinder(),
      before = source.positions.slice(),
      result = splitHorizontal(source, height);
    expect(validateMesh(result.lower).ok).toBe(true);
    expect(validateMesh(result.upper).ok).toBe(true);
    expect(bounds(result.lower)).toEqual([0, height]);
    expect(bounds(result.upper)).toEqual([height, 80]);
    const total =
      validateMesh(result.lower).signedVolumeMm3 + validateMesh(result.upper).signedVolumeMm3;
    expect(total).toBeCloseTo(validateMesh(source).signedVolumeMm3, 1);
    expect(source.positions).toEqual(before);
  });
  it('keeps the through-hole of a tapered annular chuck open in both parts', () => {
    const source = buildChuck({ baseDiameter: 80, height: 40, drainDiameter: 8 });
    const result = splitHorizontal(source, 20);
    for (const part of [result.lower, result.upper]) {
      const report = validateMesh(part);
      expect(report.ok).toBe(true);
      expect(report.euler).toBe(0);
    }
  });
  it.each([NaN, Infinity, -1, 0, 80, 81])('rejects invalid or tangent cut heights %s', (height) => {
    expect(() => splitHorizontal(cylinder(), height)).toThrow();
  });
  it('rejects malformed/open meshes without returning partial pieces', () => {
    const source = cylinder();
    expect(() => splitHorizontal({ ...source, indices: source.indices.slice(3) }, 40)).toThrow(
      'INVALID_SPLIT_MESH',
    );
    const positions = source.positions.slice();
    positions[0] = NaN;
    expect(() => splitHorizontal({ ...source, positions }, 40)).toThrow('INVALID_SPLIT_MESH');
  });
});
