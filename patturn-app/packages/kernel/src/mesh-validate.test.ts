import { expect, it } from 'vitest';
import { validateMesh } from './mesh-validate';
import { signedVolume, type Mesh } from './revolve';
// Positive-volume tetrahedron. Its three faces through the origin contribute zero
// signed volume, so flipping one of them evades a volume-only orientation check.
const tetra = (): Mesh => ({
  positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]),
  indices: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
});
it('accepts valid topology deterministically without mutating caller buffers', () => {
  const mesh = tetra(),
    before = structuredClone(mesh),
    report = validateMesh(mesh);
  expect(report.ok).toBe(true);
  expect(report.euler).toBe(2);
  expect(report.openEdges).toBe(0);
  expect(report.inconsistentEdges).toBe(0);
  expect(validateMesh(mesh)).toEqual(report);
  expect(mesh).toEqual(before);
});
it.each([NaN, Infinity, -Infinity])(
  'rejects nonfinite positions %s even on otherwise closed topology',
  (value) => {
    const mesh = tetra();
    mesh.positions[0] = value;
    const report = validateMesh(mesh);
    expect(report.ok).toBe(false);
    expect(report.problems).toContain('NONFINITE_POSITION');
    expect(Number.isFinite(report.signedVolumeMm3)).toBe(true);
  },
);
it.each([4, 4294967295])('rejects index %s outside the vertex buffer', (index) => {
  const mesh = tetra();
  mesh.indices[0] = index;
  const report = validateMesh(mesh);
  expect(report.ok).toBe(false);
  expect(report.problems).toContain('INDEX_OUT_OF_RANGE');
});
it.each(['positions', 'indices'] as const)('rejects incomplete %s triples', (key) => {
  const mesh = tetra();
  if (key === 'positions') mesh.positions = mesh.positions.slice(1);
  else mesh.indices = mesh.indices.slice(1);
  expect(validateMesh(mesh).problems).toContain('INVALID_ARRAY_LENGTH');
});
it.each(['positions', 'indices'] as const)('rejects empty %s', (key) => {
  const mesh = tetra();
  if (key === 'positions') mesh.positions = new Float32Array();
  else mesh.indices = new Uint32Array();
  expect(validateMesh(mesh).problems).toContain('EMPTY_MESH');
});
it('rejects runtime buffers that do not satisfy the typed mesh contract', () => {
  const mesh = tetra();
  for (const bad of [
    { ...mesh, positions: Array.from(mesh.positions) },
    { ...mesh, indices: new Float32Array(mesh.indices) },
    { ...mesh, positions: null },
  ])
    expect(validateMesh(bad as unknown as Mesh).problems).toContain('INVALID_BUFFERS');
});
it.each([0, 1, 2, 3])(
  'rejects individually flipped face %i even with positive total volume',
  (face) => {
    const mesh = tetra(),
      offset = face * 3;
    [mesh.indices[offset], mesh.indices[offset + 1]] = [
      mesh.indices[offset + 1]!,
      mesh.indices[offset]!,
    ];
    const report = validateMesh(mesh);
    expect(report.openEdges).toBe(0);
    expect(report.inconsistentEdges).toBe(3);
    expect(report.ok).toBe(false);
    expect(report.problems).toContain('INCONSISTENT_WINDING:3');
    if (face < 3) expect(signedVolume(mesh)).toBeGreaterThan(0);
  },
);
it('still detects a wholly inverted shell, boundaries, duplicate and degenerate faces', () => {
  const reversed = tetra();
  for (let i = 0; i < reversed.indices.length; i += 3)
    [reversed.indices[i], reversed.indices[i + 1]] = [
      reversed.indices[i + 1]!,
      reversed.indices[i]!,
    ];
  expect(validateMesh(reversed).problems).toContain('INVERTED_NORMALS');
  expect(validateMesh(reversed).inconsistentEdges).toBe(0);
  const open = tetra();
  open.indices = open.indices.slice(3);
  expect(validateMesh(open).openEdges).toBe(3);
  const duplicate = tetra();
  duplicate.indices = new Uint32Array([...duplicate.indices, 0, 2, 1]);
  expect(validateMesh(duplicate).duplicateTris).toBe(1);
  const degenerate = tetra();
  degenerate.indices = new Uint32Array([...degenerate.indices, 0, 0, 1]);
  expect(validateMesh(degenerate).degenerateTris).toBe(1);
});
