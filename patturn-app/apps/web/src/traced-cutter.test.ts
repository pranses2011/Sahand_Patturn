import { expect, it } from 'vitest';
import { traceImage } from '@patturn/patterns';
import { tracedCutterGeometry } from './traced-cutter';
const options = { heightMm: 20, wallMm: 1.6, tipMm: 0.6 };
function image(hole = false) {
  const width = 32,
    height = 32,
    pixels = new Uint8Array(width * height).fill(255);
  for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) pixels[y * width + x] = 0;
  if (hole) for (let y = 12; y < 20; y++) for (let x = 12; x < 20; x++) pixels[y * width + x] = 255;
  return { width, height, pixels };
}
it('builds the actual simplified trace at physical scale without changing its source', () => {
  const trace = traceImage({ ...image(), referenceWidthMm: 100, toleranceMm: 0.2 });
  const before = JSON.stringify(trace.contours),
    result = tracedCutterGeometry(trace.contours, options);
  expect(result.report.ok).toBe(true);
  expect(result.report.euler).toBe(0);
  expect(result.polygon.width).toBeCloseTo(50);
  expect(result.polygon.depth).toBeCloseTo(50);
  expect(JSON.stringify(trace.contours)).toBe(before);
  const scaled = traceImage({ ...image(), referenceWidthMm: 80, toleranceMm: 0.2 });
  expect(tracedCutterGeometry(scaled.contours, options).polygon.width).toBeCloseTo(40);
});
it('rejects traced holes or absent contours instead of selecting only the exterior', () => {
  const trace = traceImage({ ...image(true), referenceWidthMm: 100, toleranceMm: 0.2 });
  expect(trace.contours.length).toBeGreaterThan(1);
  expect(() => tracedCutterGeometry(trace.contours, options)).toThrow('SINGLE_CONTOUR');
  expect(() => tracedCutterGeometry([], options)).toThrow('SINGLE_CONTOUR');
});
it('rejects concavity, excessive vertices and out-of-range physical scale without a convex-hull fallback', () => {
  expect(() =>
    tracedCutterGeometry(
      [
        [
          [0, 0],
          [40, 0],
          [20, 20],
          [40, 40],
          [0, 40],
        ],
      ],
      options,
    ),
  ).toThrow();
  expect(() =>
    tracedCutterGeometry(
      [Array.from({ length: 66 }, (_, i) => [50 * Math.cos(i), 50 * Math.sin(i)] as const)],
      options,
    ),
  ).toThrow();
  const trace = traceImage({ ...image(), referenceWidthMm: 20, toleranceMm: 0.2 });
  expect(() => tracedCutterGeometry(trace.contours, options)).toThrow('BOUNDS');
});
