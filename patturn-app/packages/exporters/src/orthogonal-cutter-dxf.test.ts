import { expect, it } from 'vitest';
import DxfParser from 'dxf-parser';
import { type CutterPoint } from '@patturn/kernel';
import { toOrthogonalCutterDxf } from './index';
const points: CutterPoint[] = [
  [10.25, 20.5],
  [90.25, 20.5],
  [90.25, 50.5],
  [40.25, 50.5],
  [40.25, 100.5],
  [10.25, 100.5],
];
const options = { heightMm: 20, wallMm: 1.6, tipMm: 0.6 };
function parse(input: readonly CutterPoint[] = points) {
  const result = toOrthogonalCutterDxf(input, options);
  expect(result.ok).toBe(true);
  return { result, doc: new DxfParser().parseSync(new TextDecoder().decode(result.bytes))! };
}
it('emits one exact closed mm R2000 boundary, not the wall or handle', () => {
  const { result, doc } = parse();
  expect(result.filename).toBe('orthogonal-cutter_inner-boundary_W80-D80mm.dxf');
  expect(doc.header['$ACADVER']).toBe('AC1015');
  expect(doc.header['$INSUNITS']).toBe(4);
  expect(doc.header['$MEASUREMENT']).toBe(1);
  expect(doc.entities).toHaveLength(1);
  const entity = doc.entities[0] as unknown as {
    type: string;
    layer: string;
    shape: boolean;
    vertices: { x: number; y: number; z: number }[];
  };
  expect(entity.type).toBe('LWPOLYLINE');
  expect(entity.layer).toBe('INNER_BOUNDARY');
  expect(entity.shape).toBe(true);
  expect(entity.vertices.map((p) => [p.x, p.y])).toEqual([
    [0, 0],
    [80, 0],
    [80, 30],
    [30, 30],
    [30, 80],
    [0, 80],
  ]);
});
it('preserves decimal lengths, winding and input without reflection or rounding', () => {
  const input = points.map(([x, y]) => [x + 0.125, y + 0.25] as CutterPoint);
  input[1] = [90.625, 20.75];
  input[2] = [90.625, 50.75];
  const before = structuredClone(input),
    { doc, result } = parse(input);
  const vertices = (doc.entities[0] as unknown as { vertices: { x: number; y: number }[] })
    .vertices;
  expect(vertices.map((p) => [p.x, p.y])).toEqual([
    [0, 0],
    [80.25, 0],
    [80.25, 30],
    [30, 30],
    [30, 80],
    [0, 80],
  ]);
  expect(toOrthogonalCutterDxf(input, options)).toEqual(result);
  expect(input).toEqual(before);
});
it('removes only the duplicate closing vertex and accepts reverse winding', () => {
  expect(parse([...points, points[0]!]).result).toEqual(parse().result);
  const reversed = points.slice().reverse();
  const { doc } = parse(reversed);
  const vertices = (doc.entities[0] as unknown as { vertices: { x: number; y: number }[] })
    .vertices;
  expect(vertices.map((p) => [p.x, p.y])).toEqual(reversed.map(([x, y]) => [x - 10.25, y - 20.5]));
});
it.each([
  [],
  [
    [0, 0],
    [80, 0],
    [80, 80],
    [30, 30],
    [0, 80],
  ],
  [
    [0, 0],
    [Infinity, 0],
    [80, 80],
    [0, 80],
  ],
])('rejects invalid contours atomically: %j', (...input) => {
  const result = toOrthogonalCutterDxf(input as CutterPoint[], options);
  expect(result.ok).toBe(false);
  expect(result.filename).toBe('');
  expect(result.bytes).toBeUndefined();
});
it.each([{ heightMm: NaN }, { wallMm: 12 }, { tipMm: 5 }])(
  'validates actual 3D settings before exporting: %j',
  (override) => {
    const result = toOrthogonalCutterDxf(points, { ...options, ...override });
    expect(result.ok).toBe(false);
    expect(result.bytes).toBeUndefined();
  },
);
