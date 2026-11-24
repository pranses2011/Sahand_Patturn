import { extruderLayout, type ExtruderOptions } from '@patturn/kernel';

/** Same polygonal centerline contours as the extruded solid. No kerf compensation. */
export function extruderDrawing(options: ExtruderOptions) {
  const layout = extruderLayout(options),
    offset = layout.diameterMm / 2;
  const f = (n: number) => String(Math.round(n * 1e6) / 1e6);
  const paths = layout.contours.map((contour) => ({
    d:
      contour.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x + offset)} ${f(y + offset)}`).join(' ') +
      ' Z',
  }));
  return {
    paths,
    width: layout.diameterMm + 1e-5,
    height: layout.diameterMm + 1e-5,
    minWebMm: layout.minWebMm,
  };
}
