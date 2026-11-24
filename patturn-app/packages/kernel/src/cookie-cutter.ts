import type { Mesh } from './revolve.js';
export interface CircularCutterOptions {
  diameterMm: number;
  heightMm: number;
  wallMm: number;
  tipMm: number;
  segments?: number;
}
/** Finite-thickness cutting end at y=0; grip at y=height. No food/load certification. */
export function circularCutterProfile(options: CircularCutterOptions) {
  const { diameterMm, heightMm, wallMm, tipMm, segments = 128 } = options;
  if (
    !Number.isFinite(diameterMm) ||
    diameterMm < 20 ||
    diameterMm > 150 ||
    !Number.isFinite(heightMm) ||
    heightMm < 10 ||
    heightMm > 40 ||
    !Number.isFinite(wallMm) ||
    wallMm < 0.8 ||
    wallMm > 3 ||
    !Number.isFinite(tipMm) ||
    tipMm < 0.4 ||
    tipMm > 1.2 ||
    tipMm > wallMm ||
    !Number.isInteger(segments) ||
    segments < 24 ||
    segments > 256
  )
    throw Error('CUTTER_INVALID_OPTIONS');
  const r = diameterMm / 2;
  // A constant wall does not need an extra collinear bevel vertex.
  const rings = [
    { r, y: 0 },
    { r: r + tipMm, y: 0 },
  ];
  if (tipMm !== wallMm) rings.push({ r: r + wallMm, y: 3 });
  rings.push(
    { r: r + wallMm, y: heightMm - 3 },
    { r: r + wallMm + 3, y: heightMm - 3 },
    { r: r + wallMm + 3, y: heightMm },
    { r, y: heightMm },
  );
  return { rings, segments, minimumOpeningMm: diameterMm * Math.cos(Math.PI / segments) };
}
/** Closed periodic profile with shared vertices at every seam; mm, outward CCW. */
export function buildCircularCutter(options: CircularCutterOptions): Mesh {
  const { rings, segments } = circularCutterProfile(options);
  const positions = new Float32Array(rings.length * segments * 3);
  const indices = new Uint32Array(rings.length * segments * 6);
  rings.forEach((point, ring) => {
    for (let s = 0; s < segments; s++) {
      const angle = (2 * Math.PI * s) / segments,
        offset = (ring * segments + s) * 3;
      positions.set([point.r * Math.cos(angle), point.y, point.r * Math.sin(angle)], offset);
      const a = ring * segments + s,
        b = ring * segments + ((s + 1) % segments);
      const c = ((ring + 1) % rings.length) * segments + ((s + 1) % segments),
        d = ((ring + 1) % rings.length) * segments + s;
      indices.set([a, c, b, a, d, c], (ring * segments + s) * 6);
    }
  });
  return { positions, indices };
}
