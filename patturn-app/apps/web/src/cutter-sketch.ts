import { convexCutterProfile, type CutterPoint } from '@patturn/kernel';
/** Physical 150mm workspace inside a 5mm viewport margin. Snap to 1mm, never pixels as mm. */
export function cutterSketchPoint(
  x: number,
  y: number,
  width: number,
  height: number,
): [number, number] {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0)
    throw Error('CUTTER_SKETCH_INVALID_VIEWPORT');
  return [
    Math.round(Math.max(0, Math.min(150, (x / width) * 160 - 5))),
    Math.round(Math.max(0, Math.min(150, (y / height) * 160 - 5))),
  ];
}

/** Hit tolerance is in CSS pixels, independent of the physical workspace and zoom. */
export function cutterSketchHit(
  points: readonly (readonly [number, number])[],
  x: number,
  y: number,
  width: number,
  height: number,
): number | null {
  // Share viewport validation with coordinate conversion, but do not snap before hit testing.
  cutterSketchPoint(x, y, width, height);
  let nearest: number | null = null;
  let distance = 12 ** 2;
  points.forEach(([px, py], index) => {
    const squared = (((px + 5) / 160) * width - x) ** 2 + (((py + 5) / 160) * height - y) ** 2;
    if (squared <= distance && (nearest === null || squared < distance)) {
      nearest = index;
      distance = squared;
    }
  });
  return nearest;
}

/** Copy a supported SVG contour into the workspace without rescaling or changing topology. */
export function cutterSketchSeed(input: readonly CutterPoint[]): CutterPoint[] {
  convexCutterProfile(input, { heightMm: 20, wallMm: 1.6, tipMm: 0.6 });
  const points = input.slice();
  if (points[0]![0] === points.at(-1)![0] && points[0]![1] === points.at(-1)![1]) points.pop();
  const minX = Math.min(...points.map((p) => p[0])),
    minY = Math.min(...points.map((p) => p[1]));
  return points.map(([x, y]) => [x - minX, y - minY]);
}
