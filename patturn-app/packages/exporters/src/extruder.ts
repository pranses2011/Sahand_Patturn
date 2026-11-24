import { extruderLayout, type ExtruderOptions } from '@patturn/kernel';

/** Body plate contours only. The 3D collar/shoulder is deliberately NOT a cutting line. */
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
