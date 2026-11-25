import { expect, it } from 'vitest';
import { type Mesh } from '@patturn/kernel';
import { toBinaryStl, toBuildZip, toObj } from './index';
const tetra = (): Mesh => ({
  positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]),
  indices: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
});
const cases = [
  {
    name: 'NaN coordinate',
    break: (mesh: Mesh) => {
      mesh.positions[0] = NaN;
    },
  },
  {
    name: 'infinite coordinate',
    break: (mesh: Mesh) => {
      mesh.positions[0] = Infinity;
    },
  },
  {
    name: 'out-of-range vertex index',
    break: (mesh: Mesh) => {
      mesh.indices[0] = 4;
    },
  },
  {
    name: 'incomplete coordinate triples',
    break: (mesh: Mesh) => {
      mesh.positions = mesh.positions.slice(1);
    },
  },
  {
    name: 'incomplete index triples',
    break: (mesh: Mesh) => {
      mesh.indices = mesh.indices.slice(1);
    },
  },
  {
    name: 'empty triangles',
    break: (mesh: Mesh) => {
      mesh.indices = new Uint32Array();
    },
  },
  {
    name: 'locally inverted face with positive total volume',
    break: (mesh: Mesh) => {
      [mesh.indices[0], mesh.indices[1]] = [mesh.indices[1]!, mesh.indices[0]!];
    },
  },
];
it.each(cases)('rejects $name in direct STL, OBJ and atomic ZIP without bytes', async (fixture) => {
  const mesh = tetra();
  fixture.break(mesh);
  const before = structuredClone(mesh);
  const outputs = [
    toBinaryStl(mesh),
    toObj([{ name: 'bad', mesh }]),
    await toBuildZip({
      project: 'bad',
      meshes: [{ path: 'parts/bad.stl', mesh }],
      instructions: 'هیچ فایل ناقصی نباید تحویل شود.',
    }),
  ];
  for (const result of outputs) {
    expect(result.ok).toBe(false);
    expect(result.filename).toBe('');
    expect(result.bytes).toBeUndefined();
    expect(result.error).toBeTruthy();
  }
  expect(mesh).toEqual(before);
});
it('still exports valid closed tetrahedra in all three formats', async () => {
  const mesh = tetra();
  for (const result of [
    toBinaryStl(mesh),
    toObj([{ name: 'good', mesh }]),
    await toBuildZip({
      project: 'good',
      meshes: [{ path: 'good.stl', mesh }],
      instructions: 'واحد میلی‌متر',
    }),
  ]) {
    expect(result.ok, result.error).toBe(true);
    expect(result.bytes!.length).toBeGreaterThan(0);
  }
});
