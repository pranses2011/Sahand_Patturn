import { expect, it } from 'vitest';
import { traceImage, tracePixelBoundary } from '@patturn/patterns';
import { tracedOrthogonalCutterGeometry } from './traced-cutter';
const options = { heightMm: 20, wallMm: 1.6, tipMm: 0.6 };
function image(hole = false) {
  const width = 96,
    height = 96,
    pixels = new Uint8Array(width * height).fill(255);
  for (let y = 16; y < 80; y++)
    for (let x = 16; x < 80; x++) if (y < 40 || x < 40) pixels[y * width + x] = 0;
  if (hole) for (let y = 22; y < 32; y++) for (let x = 22; x < 32; x++) pixels[y * width + x] = 255;
  return { width, height, pixels };
}
it('uses the exact current L trace at physical scale without changing its source', () => {
  const trace = tracePixelBoundary({ ...image(), referenceWidthMm: 100 });
  const before = JSON.stringify(trace.contours);
  const result = tracedOrthogonalCutterGeometry(trace.contours, options);
  expect(result.report.ok).toBe(true);
  expect(result.report.euler).toBe(0);
  expect(result.profile.points).toHaveLength(6);
  expect(result.profile.width).toBeCloseTo(200 / 3, 2);
  expect(JSON.stringify(trace.contours)).toBe(before);
  const scaled = tracePixelBoundary({ ...image(), referenceWidthMm: 80 });
  expect(tracedOrthogonalCutterGeometry(scaled.contours, options).profile.width).toBeCloseTo(
    160 / 3,
    2,
  );
});
it('never drops a traced hole or selects only one of several contours', () => {
  const trace = tracePixelBoundary({ ...image(true), referenceWidthMm: 100 });
  expect(trace.contours.length).toBeGreaterThan(1);
  expect(() => tracedOrthogonalCutterGeometry(trace.contours, options)).toThrow('SINGLE_CONTOUR');
  expect(() => tracedOrthogonalCutterGeometry([], options)).toThrow('SINGLE_CONTOUR');
});
it('rejects invalid physical scale and does not repair diagonal or narrow contours', () => {
  const tiny = tracePixelBoundary({ ...image(), referenceWidthMm: 20 });
  expect(() => tracedOrthogonalCutterGeometry(tiny.contours, options)).toThrow();
  expect(() =>
    tracedOrthogonalCutterGeometry(
      [
        [
          [0, 0],
          [80, 0],
          [80, 80],
          [30, 30],
          [0, 80],
        ],
      ],
      options,
    ),
  ).toThrow();
  expect(() =>
    tracedOrthogonalCutterGeometry(
      [
        [
          [0, 0],
          [80, 0],
          [80, 80],
          [43, 80],
          [43, 30],
          [37, 30],
          [37, 80],
          [0, 80],
        ],
      ],
      options,
    ),
  ).toThrow('CLEARANCE');
});

it('does not silently straighten the chamfers of the default marching-squares trace', () => {
  const trace = traceImage({ ...image(), referenceWidthMm: 100, toleranceMm: 0.2 });
  expect(() => tracedOrthogonalCutterGeometry(trace.contours, options)).toThrow('AXIS_ALIGNED');
});
