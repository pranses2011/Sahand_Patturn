import { describe, it, expect } from 'vitest';
import { toDxf } from './dxf.js';
import DxfParser from 'dxf-parser';
const options = { bezierToleranceMm: 0.05 };
function bytes(d: string) {
  const result = toDxf([{ d }], undefined, options);
  expect(result.ok, result.error).toBe(true);
  return result.bytes;
}
describe('SVG close continuation, compact flags and aggregate DXF limits', () => {
  it.each([
    ['M0 0L10 0L10 10Z l20 20', 'M0 0L10 0L10 10Z M0 0L20 20'],
    ['M0 0L10 0L10 10Z H20 V30', 'M0 0L10 0L10 10Z M0 0H20 V30'],
    ['M0 0Q10 20 20 0Z T40 0', 'M0 0Q10 20 20 0Z M0 0Q0 0 40 0'],
    ['M0 0L10 0L10 10ZZZ L20 20', 'M0 0L10 0L10 10Z M0 0L20 20'],
    ['M0 0A20 10 30 0140 0', 'M0 0A20 10 30 0 1 40 0'],
    ['M0 0a20 10 30 10.5 20', 'M0 0a20 10 30 1 0 .5 20'],
    ['M0 0A20 10 30 01-40-10', 'M0 0A20 10 30 0 1 -40 -10'],
  ])('matches explicitly separated geometry: %s', (compact, explicit) => {
    expect(bytes(compact!)).toEqual(bytes(explicit!));
  });
  it.each(['L0 0L10 10', 'Z', 'M0 0A20 10 0 2 1 40 0', 'M0 0A20 10 0 0 2 40 0'])(
    'still rejects malformed initial state or flags: %s',
    (d) => {
      const result = toDxf([{ d }], undefined, options);
      expect(result.ok).toBe(false);
      expect(result.bytes).toBeUndefined();
    },
  );
  it('enforces global path and input-character limits before parsing', () => {
    expect(toDxf(Array.from({ length: 4097 }, () => ({ d: 'M0 0L1 1' }))).error).toContain(
      'DXF_PATH_LIMIT',
    );
    const result = toDxf([{ d: 'M0 0L1 1' + ' '.repeat(1024 * 1024) }]);
    expect(result.error).toContain('DXF_PATH_CHARACTER_LIMIT');
    expect(result.bytes).toBeUndefined();
  });
  it('enforces a shared output-vertex budget across individually bounded paths', () => {
    const d = 'M0 0' + 'L1 1L0 0'.repeat(500);
    const result = toDxf(Array.from({ length: 101 }, () => ({ d })));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('DXF_VERTEX_LIMIT');
    expect(result.bytes).toBeUndefined();
  });
  it('preserves the actual closed and open entity flags after continuation', () => {
    const result = toDxf([{ d: 'M0 0L10 0L10 10Z L20 20' }]);
    expect(result.ok, result.error).toBe(true);
    const doc = new DxfParser().parseSync(new TextDecoder().decode(result.bytes))!;
    expect(doc.entities).toHaveLength(2);
    const [closed, open] = doc.entities as unknown as {
      shape: boolean;
      vertices: { x: number; y: number }[];
    }[];
    expect(closed!.shape).toBe(true);
    expect(open!.shape).toBe(false);
    expect(open!.vertices[0]).toMatchObject({ x: 0, y: 0 });
  });
});

describe('SVG numeric separator validation before exact or flattened recognition', () => {
  it.each([
    ',M0 0L1 1',
    'M,0 0L1 1',
    'M0,,0L1 1',
    'M0, ,0L1 1',
    'M0 0,L1 1',
    'M0 0L1 1,',
    'M0 0L1 1,Z',
    'M0 0L1 1Z,',
    'M0 0A10 10 0,0,,1 20 0',
    'M0 0A10 10 0 0 1 20 0,',
    'M0 0a10 10 0 1 0 20 0a10 10 0 1 0 -20 0,z',
    'M0\u00a00L1 1',
    'M0\v0L1 1',
    'M0\f0L1 1',
    'M0\u20280L1 1',
  ])('rejects invalid separators atomically: %s', (d) => {
    const result = toDxf([{ d: 'M0 0L2 2' }, { d }], undefined, options);
    expect(result.ok).toBe(false);
    expect(result.bytes).toBeUndefined();
    expect(result.error).toMatch(/DXF_INVALID_(SEPARATOR|PATH)/);
  });
  it.each([
    ['M0,0L1,1', 'M0 0L1 1'],
    ['M\t0\r0\nL1 , \t1', 'M0 0L1 1'],
    ['M.5.5L1e1-2', 'M.5 .5L10 -2'],
    ['M0 0A20,10,30,0,1,40,0', 'M0 0A20 10 30 0 1 40 0'],
    ['M0 0A20 10 30 0140 0', 'M0 0A20 10 30 0 1 40 0'],
  ])('preserves legal SVG separators: %s', (d, explicit) => {
    expect(bytes(d)).toEqual(bytes(explicit));
  });
});
