import { expect, it } from 'vitest';
import { tracePixelBoundary } from './trace-pixel-boundary.js';
function raster(width = 12, height = 12) {
  return { width, height, pixels: new Uint8Array(width * height).fill(255), referenceWidthMm: 120 };
}
const area = (points: readonly (readonly [number, number])[]) =>
  points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;
it('traces exact pixel cell boundaries, removes only collinear vertices and preserves source', () => {
  const image = raster();
  for (let y = 2; y < 10; y++)
    for (let x = 2; x < 10; x++) if (x < 5 || y < 5) image.pixels[y * 12 + x] = 0;
  const before = image.pixels.slice(),
    result = tracePixelBoundary(image);
  expect(result.contours).toHaveLength(1);
  expect(result.contours[0]).toHaveLength(6);
  expect(area(result.contours[0]!)).toBe(3900);
  expect(result.width).toBe(120);
  expect(result.height).toBe(120);
  expect(image.pixels).toEqual(before);
  expect(tracePixelBoundary(image)).toEqual(result);
  result.contours[0]!.forEach((p, i) => {
    const q = result.contours[0]![(i + 1) % 6]!;
    expect((p[0] === q[0]) !== (p[1] === q[1])).toBe(true);
  });
  const scaled = tracePixelBoundary({ ...image, referenceWidthMm: 60 });
  expect(area(scaled.contours[0]!)).toBe(975);
});
it('preserves holes with opposite winding and disjoint regions instead of discarding contours', () => {
  const image = raster();
  for (let y = 1; y < 11; y++) for (let x = 1; x < 11; x++) image.pixels[y * 12 + x] = 0;
  for (let y = 4; y < 8; y++) for (let x = 4; x < 8; x++) image.pixels[y * 12 + x] = 255;
  const result = tracePixelBoundary(image);
  expect(result.contours).toHaveLength(2);
  expect(result.contours.map(area)).toEqual([10000, -1600]);
  const separate = raster();
  separate.pixels[1 * 12 + 1] = 0;
  separate.pixels[8 * 12 + 8] = 0;
  expect(tracePixelBoundary(separate).contours).toHaveLength(2);
});
it('closes non-uniform shapes touching the image border and carries no false shape for uniform images', () => {
  const image = raster();
  image.pixels[0] = 0;
  const result = tracePixelBoundary(image);
  expect(result.contours[0]).toEqual([
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ]);
  for (const value of [0, 127, 255])
    expect(
      tracePixelBoundary({ ...image, pixels: new Uint8Array(144).fill(value) }).contours,
    ).toEqual([]);
});
it('rejects ambiguous diagonal contacts rather than joining or silently splitting them', () => {
  const image = raster();
  image.pixels[1 * 12 + 1] = 0;
  image.pixels[2 * 12 + 2] = 0;
  expect(() => tracePixelBoundary(image)).toThrow('DIAGONAL_CONTACT');
});
it('bounds edge and contour work on complex images before exporting partial geometry', () => {
  const stripes = raster(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x += 2) stripes.pixels[y * 256 + x] = 0;
  expect(() => tracePixelBoundary(stripes)).toThrow('TOO_COMPLEX');
  const islands = raster(72, 72);
  let count = 0;
  for (let y = 1; y < 71 && count < 513; y += 3)
    for (let x = 1; x < 71 && count < 513; x += 3) {
      islands.pixels[y * 72 + x] = 0;
      count++;
    }
  expect(count).toBe(513);
  expect(() => tracePixelBoundary(islands)).toThrow('TOO_COMPLEX');
});
it.each([
  { width: 1 },
  { height: 257 },
  { width: 2.5 },
  { pixels: new Uint8Array(5) },
  { referenceWidthMm: 9 },
  { referenceWidthMm: 501 },
  { referenceWidthMm: Infinity },
])('rejects invalid raster/physical dimensions %j', (patch) => {
  expect(() => tracePixelBoundary({ ...raster(), ...patch })).toThrow('INVALID_PIXEL_TRACE');
});
