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
