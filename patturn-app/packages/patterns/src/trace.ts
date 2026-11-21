import type { Path } from './index.js';
type Point = [number, number];
/** Otsu split, with deterministic lowest-threshold tie breaking. */
export function otsu(pixels: Uint8Array): number {
  if (!pixels.length) throw Error('EMPTY_IMAGE');
  const hist = new Uint32Array(256);
  let sum = 0;
  for (const value of pixels) {
    hist[value] = hist[value]! + 1;
    sum += value;
  }
  let count = 0,
    partial = 0,
    best = -1,
    threshold = 0;
  for (let t = 0; t < 255; t++) {
    count += hist[t]!;
    partial += t * hist[t]!;
    if (!count || count === pixels.length) continue;
    const diff = partial / count - (sum - partial) / (pixels.length - count);
    const score = count * (pixels.length - count) * diff * diff;
    if (score > best) {
      best = score;
      threshold = t;
    }
  }
  return threshold;
}
function distance(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = dx * dx + dy * dy;
  const t = length
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length))
    : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
/** Iterative RDP avoids recursion depth depending on image complexity. */
function simplify(points: Point[], epsilon: number): Point[] {
  const keep = new Set([0, points.length - 1]),
    stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = epsilon,
      index = -1;
    for (let i = a! + 1; i < b!; i++) {
      const d = distance(points[i]!, points[a!]!, points[b!]!);
      if (d > best) {
        best = d;
        index = i;
      }
    }
    if (index !== -1) {
      keep.add(index);
      stack.push([a!, index], [index, b!]);
    }
  }
  return [...keep].sort((a, b) => a - b).map((i) => points[i]!);
}
export interface TraceOptions {
  width: number;
  height: number;
  pixels: Uint8Array;
  referenceWidthMm: number;
  toleranceMm: number;
}
export function traceImage({ width, height, pixels, referenceWidthMm, toleranceMm }: TraceOptions) {
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
    referenceWidthMm > 500 ||
    !Number.isFinite(toleranceMm) ||
    toleranceMm < 0 ||
    toleranceMm > 2
  )
    throw Error('INVALID_TRACE');
  const threshold = otsu(pixels),
    scale = referenceWidthMm / width;
  // White border closes contours touching the image edge. Uniform images carry no contrast.
  const uniform = pixels.every((v) => v === pixels[0]);
  const dark = (x: number, y: number) =>
    !uniform && x >= 0 && y >= 0 && x < width && y < height && pixels[y * width + x]! <= threshold;
  const adjacency = new Map<string, string[]>(),
    positions = new Map<string, Point>();
  function edge(a: Point, b: Point) {
    const key = (p: Point) => `${p[0]},${p[1]}`,
      ka = key(a),
      kb = key(b);
    positions.set(ka, a);
    positions.set(kb, b);
    adjacency.set(ka, [...(adjacency.get(ka) ?? []), kb]);
    adjacency.set(kb, [...(adjacency.get(kb) ?? []), ka]);
  }
  // Ambiguous saddles keep diagonal foreground pixels separate (4-connected dark regions).
  const table: number[][][] = [
    [],
    [[3, 0]],
    [[0, 1]],
    [[3, 1]],
    [[1, 2]],
    [
      [3, 0],
      [1, 2],
    ],
    [[0, 2]],
    [[3, 2]],
    [[2, 3]],
    [[0, 2]],
    [
      [0, 1],
      [2, 3],
    ],
    [[1, 2]],
    [[1, 3]],
    [[0, 1]],
    [[3, 0]],
    [],
  ];
  for (let y = -1; y < height; y++)
    for (let x = -1; x < width; x++) {
      const mask =
        Number(dark(x, y)) +
        2 * Number(dark(x + 1, y)) +
        4 * Number(dark(x + 1, y + 1)) +
        8 * Number(dark(x, y + 1));
      const mids: Point[] = [
        [2 * x + 1, 2 * y],
        [2 * x + 2, 2 * y + 1],
        [2 * x + 1, 2 * y + 2],
        [2 * x, 2 * y + 1],
      ];
      for (const [a, b] of table[mask]!) edge(mids[a!]!, mids[b!]!);
    }
  const visited = new Set<string>(),
    paths: Path[] = [];
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    const loop: Point[] = [];
    let current = start,
      previous = '';
    do {
      if (visited.has(current) || adjacency.get(current)?.length !== 2)
        throw Error('INVALID_TRACE_CONTOUR');
      visited.add(current);
      const p = positions.get(current)!;
      // Pixel centers lie half a pixel inside the output boundary.
      loop.push([(p[0] / 2 + 0.5) * scale, (p[1] / 2 + 0.5) * scale]);
      const next = adjacency.get(current)!.find((key) => key !== previous)!;
      previous = current;
      current = next;
    } while (current !== start);
    if (paths.length >= 512) throw Error('TRACE_TOO_COMPLEX');
    const middle = Math.floor(loop.length / 2);
    const reduced = [
      ...simplify(loop.slice(0, middle + 1), toleranceMm).slice(0, -1),
      ...simplify([...loop.slice(middle), loop[0]!], toleranceMm).slice(0, -1),
    ];
    // Never turn a closed contour into a line at large tolerance.
    const points = reduced.length >= 3 ? reduced : loop;
    const f = (n: number) => String(Math.round(n * 1e6) / 1e6);
    paths.push({
      d: points.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`).join(' ') + ' Z',
    });
  }
  return { paths, width: referenceWidthMm, height: height * scale, threshold };
}
