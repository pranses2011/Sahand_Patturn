import { describe, expect, it } from 'vitest';
import { createImageField, IMAGE_FIELD_ALGORITHM, IMAGE_FIELD_LIMITS } from './image-field';
const placement = { x: 10, y: 20, width: 20, height: 40 };
const one = (rgba: number[]) =>
  createImageField({ width: 1, height: 1, rgba: new Uint8Array(rgba) });
describe('independent linear-sRGB image controller foundation', () => {
  it.each([
    { pixel: [0, 0, 0, 255], value: 1 },
    { pixel: [255, 255, 255, 255], value: 0 },
    { pixel: [255, 0, 0, 255], value: 0.7874 },
    { pixel: [0, 255, 0, 255], value: 0.2848 },
    { pixel: [0, 0, 255, 255], value: 0.9278 },
    { pixel: [0, 0, 0, 0], value: 0 },
  ])('maps $pixel in linear light', ({ pixel, value }) =>
    expect(one(pixel).sample(20, 40, placement)).toBeCloseTo(value, 12),
  );
  it('converts gamma-encoded grey before luminance', () =>
    expect(one([128, 128, 128, 255]).sample(20, 40, placement)).toBeCloseTo(
      1 - ((128 / 255 + 0.055) / 1.055) ** 2.4,
      12,
    ));
  it('composites straight alpha over white', () =>
    expect(one([0, 0, 0, 128]).sample(20, 40, placement)).toBeCloseTo(128 / 255, 12));
  it('inverts luminance, not image bounds', () => {
    const field = one([0, 0, 0, 255]);
    expect(field.sample(20, 40, { ...placement, invert: true })).toBe(0);
    expect(one([255, 255, 255, 255]).sample(20, 40, { ...placement, invert: true })).toBe(1);
    expect(field.sample(0, 0, { ...placement, invert: true })).toBe(0);
  });
  it.each([0, 0.2, 1, 2, 4])('bounds contrast %s', (contrast) => {
    const value = one([128, 128, 128, 255]).sample(20, 40, { ...placement, contrast });
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
    if (contrast === 0) expect(value).toBe(0.5);
  });
  it('bilinearly samples pixel centres with clamped edges', () => {
    const field = createImageField({
      width: 2,
      height: 2,
      rgba: new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255]),
    });
    expect(field.sample(15, 30, placement)).toBe(1);
    expect(field.sample(25, 30, placement)).toBe(0);
    expect(field.sample(20, 40, placement)).toBe(0.5);
    expect(field.sample(10, 20, placement)).toBe(1);
    expect(field.sample(30, 60, placement)).toBe(1);
  });
  it('samples rectangular images without interchanging axes', () => {
    const field = createImageField({
      width: 2,
      height: 1,
      rgba: new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]),
    });
    expect(field.sample(15, 50, placement)).toBe(1);
    expect(field.sample(25, 25, placement)).toBe(0);
  });
  it('interpolates after alpha compositing without dark transparent fringes', () => {
    const field = createImageField({
      width: 2,
      height: 1,
      rgba: new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255]),
    });
    expect(field.sample(20, 40, placement)).toBe(0.5);
  });
  it('isolates caller mutations and repeated evaluation', () => {
    const rgba = new Uint8Array([0, 0, 0, 255]),
      input = { width: 1, height: 1, rgba };
    const field = createImageField(input);
    rgba.fill(255);
    input.width = 100;
    expect(Object.isFrozen(field)).toBe(true);
    expect(field.algorithm).toBe(IMAGE_FIELD_ALGORITHM);
    for (let i = 0; i < 100; i++) expect(field.sample(20, 40, placement)).toBe(1);
  });
  it('supports negative translated coordinates and geometric rescaling', () => {
    const field = one([0, 0, 0, 255]);
    expect(field.sample(-8, -8, { x: -10, y: -10, width: 4, height: 4 })).toBe(
      field.sample(20, 40, placement),
    );
  });
  it.each([
    { x: 9, y: 40 },
    { x: 31, y: 40 },
    { x: 20, y: 19 },
    { x: 20, y: 61 },
  ])('outside at $x $y remains zero', ({ x, y }) =>
    expect(one([0, 0, 0, 255]).sample(x, y, { ...placement, invert: true, contrast: 0 })).toBe(0),
  );
  it.each([0, -1, 1.5, NaN, Infinity, IMAGE_FIELD_LIMITS.maxDimension + 1])(
    'rejects invalid dimension %s before allocation',
    (width) =>
      expect(() => createImageField({ width, height: 1, rgba: new Uint8Array(4) })).toThrow(
        'INVALID_IMAGE_FIELD_PIXELS',
      ),
  );
  it('rejects height, pixel count, wrong buffer type and wrong lengths', () => {
    for (const input of [
      { width: 1, height: 0, rgba: new Uint8Array(4) },
      { width: 4001, height: 4000, rgba: new Uint8Array(0) },
      { width: 1, height: 1, rgba: new Uint8Array(3) },
      { width: 1, height: 1, rgba: new Float32Array(4) },
      { width: 1, height: 1, rgba: [0, 0, 0, 255] },
      null,
    ])
      expect(() => createImageField(input as never)).toThrow('INVALID_IMAGE_FIELD_PIXELS');
  });
  it('does not consume a mutable shared pixel buffer', () => {
    if (typeof SharedArrayBuffer !== 'undefined')
      expect(() =>
        createImageField({ width: 1, height: 1, rgba: new Uint8Array(new SharedArrayBuffer(4)) }),
      ).toThrow('INVALID_IMAGE_FIELD_PIXELS');
  });
  it.each([
    { width: 0 },
    { height: -1 },
    { width: 1e-7 },
    { height: Infinity },
    { x: NaN },
    { y: 1e7 },
    { contrast: -1 },
    { contrast: 5 },
    { contrast: NaN },
    { invert: 1 },
    { invert: null },
  ])('rejects invalid placement %j', (patch) =>
    expect(() => one([0, 0, 0, 255]).sample(20, 40, { ...placement, ...patch } as never)).toThrow(
      'INVALID_IMAGE_FIELD_PLACEMENT',
    ),
  );
  it('rejects nonfinite or unbounded sample coordinates and absent placement', () => {
    const field = one([0, 0, 0, 255]);
    for (const value of [NaN, Infinity, -Infinity, 1e7]) {
      expect(() => field.sample(value, 40, placement)).toThrow('INVALID_IMAGE_FIELD_PLACEMENT');
      expect(() => field.sample(20, value, placement)).toThrow('INVALID_IMAGE_FIELD_PLACEMENT');
    }
    expect(() => field.sample(20, 40, null as never)).toThrow('INVALID_IMAGE_FIELD_PLACEMENT');
  });
});
