export interface ExtruderOptions {
  diameterMm: number;
  thicknessMm: number;
  holeDiameterMm: number;
  count: number;
  orbitRadiusMm: number;
}
export const EXTRUDER_SEGMENTS = { outer: 128, hole: 64 } as const;
export const EXTRUDER_MIN_WEB_MM = 1.5;
/** Conservative circular bounds: the faceted outer boundary contains its incircle;
 * each faceted hole is contained by its circumcircle. 0.001mm reserves roundoff.
 * Web is geometric clearance only, never a load/pressure certification.
 */
export function extruderLayout(options: ExtruderOptions) {
  const { diameterMm, thicknessMm, holeDiameterMm, count, orbitRadiusMm } = options;
  if (
    !Number.isFinite(diameterMm) ||
    diameterMm < 30 ||
    diameterMm > 150 ||
    !Number.isFinite(thicknessMm) ||
    thicknessMm < 3 ||
    thicknessMm > 20 ||
    !Number.isFinite(holeDiameterMm) ||
    holeDiameterMm < 2 ||
    holeDiameterMm > 40 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 12 ||
    !Number.isFinite(orbitRadiusMm) ||
    orbitRadiusMm < 0 ||
    orbitRadiusMm > 60
  )
    throw Error('EXTRUDER_INVALID_OPTIONS');
  const radius = diameterMm / 2,
    holeRadius = holeDiameterMm / 2,
    orbit = count === 1 ? 0 : orbitRadiusMm;
  const rim = radius * Math.cos(Math.PI / EXTRUDER_SEGMENTS.outer) - orbit - holeRadius;
  const between = count === 1 ? Infinity : 2 * orbit * Math.sin(Math.PI / count) - holeDiameterMm;
  const minWebMm = Math.min(rim, between) - 0.001;
  if (minWebMm < EXTRUDER_MIN_WEB_MM) throw Error('EXTRUDER_WEB_TOO_THIN');
  const holes = Array.from({ length: count }, (_, i) => ({
    x: orbit * Math.cos((2 * Math.PI * i) / count),
    y: orbit * Math.sin((2 * Math.PI * i) / count),
    radius: holeRadius,
  }));
  const polygon = (x: number, y: number, r: number, n: number): [number, number][] =>
    Array.from({ length: n }, (_, i) => [
      x + r * Math.cos((2 * Math.PI * i) / n),
      y + r * Math.sin((2 * Math.PI * i) / n),
    ]);
  const contours = [
    polygon(0, 0, radius, EXTRUDER_SEGMENTS.outer),
    ...holes.map((h) => polygon(h.x, h.y, h.radius, EXTRUDER_SEGMENTS.hole)),
  ];
  return { contours, holes, minWebMm, diameterMm, thicknessMm };
}
