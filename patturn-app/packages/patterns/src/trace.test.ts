import { describe, it, expect } from 'vitest';
import { otsu, traceImage } from './trace.js';
const options = { width: 4, height: 4, referenceWidthMm: 40, toleranceMm: 0 };
describe('Deterministic Otsu marching squares and RDP', () => {
  it('uses lowest Otsu threshold and rejects empty input', () => {
    expect(otsu(new Uint8Array([0, 0, 255, 255]))).toBe(0);
    expect(otsu(new Uint8Array([50, 50, 200, 200]))).toBe(50);
    expect(() => otsu(new Uint8Array())).toThrow();
  });
  it.each([0, 255])('returns no contour for a uniform %s raster', (value) => {
    expect(traceImage({ ...options, pixels: new Uint8Array(16).fill(value) }).paths).toHaveLength(
      0,
    );
  });
  it('closes dark pixels on the image boundary and preserves diagonal separation', () => {
    const pixels = new Uint8Array([
      0, 255, 255, 255, 255, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
    ]);
    const drawing = traceImage({ ...options, pixels });
    expect(drawing.paths).toHaveLength(2);
    for (const path of drawing.paths) expect(path.d).toMatch(/ Z$/);
    expect(drawing).toEqual(traceImage({ ...options, pixels }));
  });
  it('traces both outer and inner contours and preserves coordinates in bounds', () => {
    const pixels = new Uint8Array([0, 0, 0, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 0, 0, 0]);
    const drawing = traceImage({ ...options, pixels });
    expect(drawing.paths).toHaveLength(2);
    for (const path of drawing.paths)
      for (const value of path.d.match(/\d+(?:\.\d+)?/g)!.map(Number)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(40);
      }
  });
  it('scales output with the reference width, simplifying straight edges without dropping closed paths', () => {
    const pixels = new Uint8Array(16).fill(255);
    pixels[5] = 0;
    pixels[6] = 0;
    pixels[9] = 0;
    pixels[10] = 0;
    const raw = traceImage({ ...options, pixels }),
      simple = traceImage({ ...options, pixels, toleranceMm: 2 });
    expect(simple.paths.length).toBe(raw.paths.length);
    expect(simple.paths[0]!.d.length).toBeLessThanOrEqual(raw.paths[0]!.d.length);
    const scaled = traceImage({ ...options, pixels, referenceWidthMm: 80 });
    expect(scaled.width).toBe(80);
    expect(scaled.height).toBe(80);
    expect(scaled.paths[0]!.d.match(/\d+(?:\.\d+)?/g)!.map(Number)).toEqual(
      raw.paths[0]!.d.match(/\d+(?:\.\d+)?/g)!.map((n) => Number(n) * 2),
    );
  });
  it.each([
    { width: 0 },
    { height: 257 },
    { toleranceMm: -1 },
    { referenceWidthMm: NaN },
    { pixels: new Uint8Array(3) },
  ])('rejects invalid image/options %j', (override) => {
    expect(() => traceImage({ ...options, pixels: new Uint8Array(16), ...override })).toThrow(
      'INVALID_TRACE',
    );
  });
  it('rejects excessive contour counts instead of producing an unbounded document', () => {
    const pixels = Uint8Array.from({ length: 64 * 64 }, (_, i) =>
      (i % 64) % 2 === 0 && Math.floor(i / 64) % 2 === 0 ? 0 : 255,
    );
    expect(() => traceImage({ ...options, width: 64, height: 64, pixels })).toThrow(
      'TRACE_TOO_COMPLEX',
    );
  });
});
