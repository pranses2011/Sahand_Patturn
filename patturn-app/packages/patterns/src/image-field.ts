/** Independent SV-23 foundation, not an image decoder or a complete UI controller.
 * Coordinates and placement are millimetres; pixels are straight-alpha sRGB.
 * Bilinear sampling uses pixel centres after compositing over white in linear light.
 */
export const IMAGE_FIELD_ALGORITHM = 'linear-srgb-rec709-bilinear-v1';
export const IMAGE_FIELD_LIMITS = Object.freeze({ maxPixels: 16_000_000, maxDimension: 16_384 });
export interface ImageFieldInput {
  width: number;
  height: number;
  rgba: Uint8Array | Uint8ClampedArray;
}
export interface ImageFieldPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  invert?: boolean;
  contrast?: number;
}
export interface ImageField {
  readonly algorithm: typeof IMAGE_FIELD_ALGORITHM;
  /** Influence in [0,1]; outside the image is always zero, even with invert. */
  sample(x: number, y: number, placement: ImageFieldPlacement): number;
}
function linear(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const CHANNEL_LINEAR = Float64Array.from({ length: 256 }, (_, i) => linear(i));
function bounded(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
/** Validates before allocation; copies pixels so caller mutation cannot change a field. */
export function createImageField(input: ImageFieldInput): ImageField {
  if (
    !input ||
    !Number.isSafeInteger(input.width) ||
    !Number.isSafeInteger(input.height) ||
    input.width < 1 ||
    input.height < 1 ||
    input.width > IMAGE_FIELD_LIMITS.maxDimension ||
    input.height > IMAGE_FIELD_LIMITS.maxDimension ||
    input.width * input.height > IMAGE_FIELD_LIMITS.maxPixels ||
    !(input.rgba instanceof Uint8Array || input.rgba instanceof Uint8ClampedArray) ||
    input.rgba.length !== input.width * input.height * 4 ||
    (typeof SharedArrayBuffer !== 'undefined' && input.rgba.buffer instanceof SharedArrayBuffer)
  ) {
    throw new Error('INVALID_IMAGE_FIELD_PIXELS');
  }
  const width = input.width,
    height = input.height;
  const pixels = new Uint8Array(input.rgba);
  const luminance = (x: number, y: number): number => {
    const offset = (y * width + x) * 4,
      alpha = pixels[offset + 3]! / 255;
    const light =
      0.2126 * CHANNEL_LINEAR[pixels[offset]!]! +
      0.7152 * CHANNEL_LINEAR[pixels[offset + 1]!]! +
      0.0722 * CHANNEL_LINEAR[pixels[offset + 2]!]!;
    return alpha * light + (1 - alpha);
  };
  return Object.freeze({
    algorithm: IMAGE_FIELD_ALGORITHM,
    sample(x: number, y: number, placement: ImageFieldPlacement): number {
      if (
        !placement ||
        !bounded(x, -1e6, 1e6) ||
        !bounded(y, -1e6, 1e6) ||
        !bounded(placement.x, -1e6, 1e6) ||
        !bounded(placement.y, -1e6, 1e6) ||
        !bounded(placement.width, 1e-6, 1e6) ||
        !bounded(placement.height, 1e-6, 1e6) ||
        (placement.invert !== undefined && typeof placement.invert !== 'boolean') ||
        (placement.contrast !== undefined && !bounded(placement.contrast, 0, 4))
      )
        throw new Error('INVALID_IMAGE_FIELD_PLACEMENT');
      const u = (x - placement.x) / placement.width,
        v = (y - placement.y) / placement.height;
      if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
      const px = Math.max(0, Math.min(width - 1, u * width - 0.5)),
        py = Math.max(0, Math.min(height - 1, v * height - 0.5));
      const x0 = Math.floor(px),
        y0 = Math.floor(py),
        x1 = Math.min(width - 1, x0 + 1),
        y1 = Math.min(height - 1, y0 + 1),
        tx = px - x0,
        ty = py - y0;
      const light =
        (luminance(x0, y0) * (1 - tx) + luminance(x1, y0) * tx) * (1 - ty) +
        (luminance(x0, y1) * (1 - tx) + luminance(x1, y1) * tx) * ty;
      const influence = placement.invert ? light : 1 - light;
      return Math.max(0, Math.min(1, (influence - 0.5) * (placement.contrast ?? 1) + 0.5));
    },
  });
}
