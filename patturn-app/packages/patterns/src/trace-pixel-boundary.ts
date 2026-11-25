import { otsu, type TraceOptions } from './trace.js';
import type { Path } from './index.js';
type Point = [number, number];
/** Explicit pixel-cell boundary, not a repair/snap of marching-squares contours. */
export function tracePixelBoundary({
  width,
  height,
  pixels,
  referenceWidthMm,
}: Omit<TraceOptions, 'toleranceMm'>) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2 ||
    width > 256 ||
    height > 256 ||
    pixels.length !== width * height ||
    !Number.isFinite(referenceWidthMm) ||
    referenceWidthMm < 10 ||
    referenceWidthMm > 500
  )
    throw Error('INVALID_PIXEL_TRACE');
  const threshold = otsu(pixels),
    scale = referenceWidthMm / width,
    uniform = pixels.every((p) => p === pixels[0]);
  const dark = (x: number, y: number) =>
    !uniform && x >= 0 && x < width && y >= 0 && y < height && pixels[y * width + x]! <= threshold;
  const stride = width + 1,
    key = (x: number, y: number) => y * stride + x;
  const edges = new Map<number, number>(),
    incoming = new Set<number>();
  const edge = (a: number, b: number) => {
    if (edges.has(a) || incoming.has(b)) throw Error('PIXEL_TRACE_DIAGONAL_CONTACT');
    if (edges.size >= 16384) throw Error('PIXEL_TRACE_TOO_COMPLEX');
    edges.set(a, b);
    incoming.add(b);
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (dark(x, y)) {
        if (!dark(x, y - 1)) edge(key(x, y), key(x + 1, y));
        if (!dark(x + 1, y)) edge(key(x + 1, y), key(x + 1, y + 1));
        if (!dark(x, y + 1)) edge(key(x + 1, y + 1), key(x, y + 1));
        if (!dark(x - 1, y)) edge(key(x, y + 1), key(x, y));
      }
  const contours: Point[][] = [],
    paths: Path[] = [],
    visited = new Set<number>();
  let totalCorners = 0;
  for (const start of edges.keys()) {
    if (visited.has(start)) continue;
    if (contours.length >= 512) throw Error('PIXEL_TRACE_TOO_COMPLEX');
    const loop: Point[] = [];
    let current = start;
    do {
      if (visited.has(current) || !edges.has(current)) throw Error('PIXEL_TRACE_INVALID_CONTOUR');
      visited.add(current);
      loop.push([current % stride, Math.floor(current / stride)]);
      current = edges.get(current)!;
    } while (current !== start);
    const corners = loop.filter((p, i) => {
      const a = loop[(i + loop.length - 1) % loop.length]!,
        b = loop[(i + 1) % loop.length]!;
      return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]));
    });
    totalCorners += corners.length;
    if (totalCorners > 4096) throw Error('PIXEL_TRACE_TOO_COMPLEX');
    const points = corners.map(
      (p) => [Number((p[0] * scale).toFixed(6)), Number((p[1] * scale).toFixed(6))] as Point,
    );
    contours.push(points);
    paths.push({ d: points.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ') + ' Z' });
  }
  return { paths, contours, width: referenceWidthMm, height: height * scale, threshold };
}
