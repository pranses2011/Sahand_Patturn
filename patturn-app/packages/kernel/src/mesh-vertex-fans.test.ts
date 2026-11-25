import { expect, it } from 'vitest';
import { validateMesh } from './mesh-validate';
import type { Mesh } from './revolve';
const faces = [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3];
/** Two positively oriented tetrahedra in opposite octants, touching only at origin. */
function touching(merged: boolean): Mesh {
  const positions = [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10];
  if (!merged) positions.push(0, 0, 0);
  positions.push(-10, 0, 0, 0, -10, 0, 0, 0, -10);
  const map = merged ? [0, 4, 5, 6] : [4, 5, 6, 7];
  const other: number[] = [];
  for (let i = 0; i < faces.length; i += 3)
    other.push(map[faces[i]!]!, map[faces[i + 2]!]!, map[faces[i + 1]!]!);
  return { positions: new Float32Array(positions), indices: new Uint32Array([...faces, ...other]) };
}
it('rejects a pinched indexed vertex even though every edge has two opposite incidents and volume is positive', () => {
  const mesh = touching(true),
    before = structuredClone(mesh),
    report = validateMesh(mesh);
  expect(report.openEdges).toBe(0);
  expect(report.inconsistentEdges).toBe(0);
  expect(report.signedVolumeMm3).toBeGreaterThan(0);
  expect(report.nonManifoldVertices).toBe(1);
  expect(report.problems).toContain('NON_MANIFOLD_VERTICES:1');
  expect(report.ok).toBe(false);
  expect(validateMesh(mesh)).toEqual(report);
  expect(mesh).toEqual(before);
});
it('does not weld geometrically coincident but separately indexed shells', () => {
  const report = validateMesh(touching(false));
  expect(report.ok).toBe(true);
  expect(report.nonManifoldVertices).toBe(0);
  expect(report.euler).toBe(4);
  // Geometric point contact/self-intersection requires a separate spatial test, not index welding here.
});
it('detects the fan independent of triangle ordering, cyclic corner order and vertex numbering', () => {
  const mesh = touching(true);
  const reversed: number[] = [];
  for (let i = mesh.indices.length - 3; i >= 0; i -= 3)
    reversed.push(mesh.indices[i + 1]!, mesh.indices[i + 2]!, mesh.indices[i]!);
  mesh.indices = new Uint32Array(reversed.map((i) => 6 - i));
  const positions = mesh.positions.slice();
  for (let i = 0; i < 7; i++) mesh.positions.set(positions.slice(i * 3, i * 3 + 3), (6 - i) * 3);
  expect(validateMesh(mesh).nonManifoldVertices).toBe(1);
});
it('accepts a connected tetrahedron fan and ignores unused vertices', () => {
  const mesh: Mesh = {
    positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10, 20, 20, 20]),
    indices: new Uint32Array(faces),
  };
  expect(validateMesh(mesh).ok).toBe(true);
  expect(validateMesh(mesh).nonManifoldVertices).toBe(0);
});
it('counts multiple disconnected fans once for their shared vertex', () => {
  const mesh = touching(true);
  const positions = new Float32Array([...mesh.positions, 0, 20, 0, -20, 0, 0, 0, 0, 20]);
  const map = [0, 7, 8, 9];
  const third = faces.map((i) => map[i]!);
  const report = validateMesh({ positions, indices: new Uint32Array([...mesh.indices, ...third]) });
  expect(report.nonManifoldVertices).toBe(1);
  expect(report.ok).toBe(false);
});

it('counts separate pinched indexed vertices independently', () => {
  const a = touching(true),
    b = touching(true);
  const positions = new Float32Array([
    ...a.positions,
    ...b.positions.map((value, index) => value + (index % 3 === 0 ? 100 : 0)),
  ]);
  const indices = new Uint32Array([...a.indices, ...b.indices.map((value) => value + 7)]);
  const report = validateMesh({ positions, indices });
  expect(report.nonManifoldVertices).toBe(2);
  expect(report.problems).toContain('NON_MANIFOLD_VERTICES:2');
});
