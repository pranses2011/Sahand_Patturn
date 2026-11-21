import { describe, it, expect } from 'vitest';
import { referenceOuterProfile, revolve } from '@patturn/kernel';
import { toObj } from './index.js';
const mesh = revolve(referenceOuterProfile(8), { segments: 16, closeBottom: true, closeTop: true });
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('OBJ export', () => {
  it('O1: preserves assembly coordinates, face winding and global one-based indices', () => {
    const out = toObj([{ name: 'A', mesh }, { name: 'B', mesh }]);
    expect(out.ok).toBe(true);
    const text = decode(out.bytes!);
    const vertices = text.split('\n').filter((l) => l.startsWith('v '));
    const faces = text.split('\n').filter((l) => l.startsWith('f '));
    expect(vertices).toHaveLength(mesh.positions.length / 3 * 2);
    expect(faces).toHaveLength(mesh.indices.length / 3 * 2);
    expect(vertices[0]!.split(' ').slice(1).map(Number)).toEqual([...mesh.positions.slice(0, 3)]);
    expect(faces[0]).toBe(`f ${mesh.indices[0]! + 1} ${mesh.indices[1]! + 1} ${mesh.indices[2]! + 1}`);
    const offset = mesh.positions.length / 3 + 1;
    expect(faces[mesh.indices.length / 3]).toBe(`f ${mesh.indices[0]! + offset} ${mesh.indices[1]! + offset} ${mesh.indices[2]! + offset}`);
    expect(text).toContain('o 1-A'); expect(text).toContain('o 2-B');
    expect(text).toContain('units: mm');
  });
  it('O2: writes optional RGB vertices, no unsupported universal-color claim', () => {
    const out = toObj([{ name: 'رنگی', mesh, color: [1, 0.5, 0] }]);
    const text = decode(out.bytes!);
    const vertex = text.split('\n').find((l) => l.startsWith('v '))!;
    expect(vertex.split(' ')).toHaveLength(7);
    expect(vertex.endsWith('1 0.5 0')).toBe(true);
    expect(text).toContain('some viewers ignore it');
  });
  it('O3: rejects the entire assembly on an invalid part or color', () => {
    expect(toObj([]).ok).toBe(false);
    const bad = { positions: new Float32Array(), indices: new Uint32Array() };
    expect(toObj([{ name: 'good', mesh }, { name: 'bad', mesh: bad }]).bytes).toBeUndefined();
    expect(toObj([{ name: 'bad', mesh, color: [1, NaN, 0] }]).error).toBe('OBJ_INVALID_COLOR');
  });
  it('O4: sanitizes injected object commands and stays deterministic', () => {
    const input = [{ name: 'A\nf 1 2 3\n#test', mesh }];
    const a = toObj(input), b = toObj(input);
    expect(a.bytes).toEqual(b.bytes);
    expect(decode(a.bytes!).split('\n').filter((l) => l.startsWith('o '))).toEqual(['o 1-A-f-1-2-3-test']);
  });
  it('O5: rejects malformed arrays, nonfinite coordinates and out-of-range indices', () => {
    expect(toObj([{ name: 'bad', mesh: { ...mesh, indices: mesh.indices.slice(1) } }]).error).toBe('OBJ_INVALID_ARRAY_LENGTH');
    const positions = mesh.positions.slice(); positions[0] = NaN;
    expect(toObj([{ name: 'bad', mesh: { ...mesh, positions } }]).error).toBe('OBJ_NONFINITE_POSITION');
    const indices = mesh.indices.slice(); indices[0] = mesh.positions.length;
    expect(toObj([{ name: 'bad', mesh: { ...mesh, indices } }]).error).toBe('OBJ_INDEX_OUT_OF_RANGE');
  });

});
