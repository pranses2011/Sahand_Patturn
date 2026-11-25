import { expect, it } from 'vitest';
import { meshProblemMessage, meshValidationMessage, meshExportErrorMessage } from './mesh-error';
import { meshValidation as text } from './messages/fa.json';
import { validateMesh, type Mesh } from '@patturn/kernel';
import { toBinaryStl, toObj, toBuildZip } from '@patturn/exporters';
it.each(Object.keys(text.simple))('explains known diagnostic %s in Persian', (code) => {
  expect(meshProblemMessage(code)).toBe(text.simple[code as keyof typeof text.simple]);
  expect(meshProblemMessage(code)).not.toContain(code);
});
it.each(Object.keys(text.counted))(
  'localizes the count for %s without changing machine codes',
  (code) => {
    expect(meshProblemMessage(`${code}:1234`)).toContain('۱٬۲۳۴');
    expect(meshProblemMessage(`${code}:1234`)).not.toContain('1234');
  },
);
it.each([
  'OPEN_EDGES:-1',
  'OPEN_EDGES:1.5',
  'OPEN_EDGES:',
  'OPEN_EDGES:Infinity',
  'OPEN_EDGES:9007199254740992',
  'parts/OPEN_EDGES:2.stl',
  'UNKNOWN:2',
  'constructor',
  '__proto__',
  'Error: OPEN_EDGES:2',
])('preserves unknown, embedded or malformed diagnostic %s', (code) =>
  expect(meshProblemMessage(code)).toBe(code),
);
it('preserves unknown members and the source report rather than hiding partial failures', () => {
  const problems = ['OPEN_EDGES:12', 'NEW_CHECK:details'],
    before = problems.slice();
  const message = meshValidationMessage(problems);
  expect(message).toContain('۱۲');
  expect(message).toContain('NEW_CHECK:details');
  expect(message).toContain(text.help);
  expect(problems).toEqual(before);
});
it('falls back to original diagnostic when no failed structured report exists', () => {
  expect(meshExportErrorMessage({ error: 'MESH_INVALID:filename:unknown' })).toBe(
    'MESH_INVALID:filename:unknown',
  );
  expect(meshExportErrorMessage({})).toBe(text.unknown);
});
it.each(['coordinate', 'winding'] as const)(
  'uses structured %s failures consistently across STL, OBJ and ZIP without parsing part names',
  async (mode) => {
    const mesh: Mesh = {
      positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]),
      indices: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
    };
    const valid = structuredClone(mesh);
    if (mode === 'coordinate') mesh.positions[0] = NaN;
    else [mesh.indices[0], mesh.indices[1]] = [mesh.indices[1]!, mesh.indices[0]!];
    const expected = validateMesh(mesh),
      before = structuredClone(expected);
    const results = [
      toBinaryStl(mesh),
      toObj([{ name: 'arbitrary:name:OPEN_EDGES:999', mesh }]),
      await toBuildZip({
        project: 'test',
        meshes: [{ path: 'parts/bad.stl', mesh }],
        instructions: 'راهنما',
      }),
      await toBuildZip({
        project: 'test',
        meshes: [{ path: 'parts/good.stl', mesh: valid }],
        assemblies: [{ path: 'assembly.obj', parts: [{ name: 'bad:part', mesh }] }],
        instructions: 'راهنما',
      }),
    ];
    for (const result of results) {
      expect(result.ok).toBe(false);
      expect(result.bytes).toBeUndefined();
      expect(result.validation).toEqual(expected);
      expect(meshExportErrorMessage(result)).toBe(meshValidationMessage(expected.problems));
      expect(result.error).toBeTruthy();
    }
    expect(expected).toEqual(before);
  },
);
