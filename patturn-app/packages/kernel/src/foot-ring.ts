import type { Mesh } from './revolve.js';
export interface FootRingOptions {
  outerRadius: number;
  width: number;
  depth: number;
  floorY: number;
  edge: 'square' | 'chamfer' | 'round';
  segments?: number;
}

/** Closed annular addition with 0.5mm overlap above the base plane for CSG union. */
export function buildFootRing({
  outerRadius,
  width,
  depth,
  floorY,
  edge,
  segments = 96,
}: FootRingOptions): Mesh {
  if (
    !Number.isFinite(outerRadius) ||
    outerRadius < 10 ||
    outerRadius > 150 ||
    !Number.isFinite(width) ||
    width < 2 ||
    width > 12 ||
    outerRadius - width < 2 ||
    !Number.isFinite(depth) ||
    depth < 2 ||
    depth > 15 ||
    !Number.isFinite(floorY) ||
    Math.abs(floorY) > 10000 ||
    !['square', 'chamfer', 'round'].includes(edge) ||
    !Number.isInteger(segments) ||
    segments < 24 ||
    segments > 256
  )
    throw Error('INVALID_FOOT_RING');
  const inner = outerRadius - width,
    bottom = floorY - depth,
    top = floorY + 0.5,
    bevel = Math.min(width / 3, depth / 3);
  const points: { r: number; y: number }[] = [];
  if (edge === 'square') points.push({ r: inner, y: bottom }, { r: outerRadius, y: bottom });
  else if (edge === 'chamfer')
    points.push(
      { r: inner, y: bottom + bevel },
      { r: inner + bevel, y: bottom },
      { r: outerRadius - bevel, y: bottom },
      { r: outerRadius, y: bottom + bevel },
    );
  else {
    for (let i = 0; i <= 6; i++) {
      const angle = Math.PI + (i * Math.PI) / 12;
      points.push({
        r: inner + bevel + bevel * Math.cos(angle),
        y: bottom + bevel + bevel * Math.sin(angle),
      });
    }
    for (let i = 0; i <= 6; i++) {
      const angle = 1.5 * Math.PI + (i * Math.PI) / 12;
      points.push({
        r: outerRadius - bevel + bevel * Math.cos(angle),
        y: bottom + bevel + bevel * Math.sin(angle),
      });
    }
  }
  points.push({ r: outerRadius, y: top }, { r: inner, y: top });
  const positions = new Float32Array(points.length * segments * 3),
    indices = new Uint32Array(points.length * segments * 6);
  points.forEach((point, ring) => {
    for (let s = 0; s < segments; s++) {
      const angle = (s * 2 * Math.PI) / segments,
        offset = (ring * segments + s) * 3;
      positions.set([point.r * Math.cos(angle), point.y, point.r * Math.sin(angle)], offset);
      const a = ring * segments + s,
        b = ring * segments + ((s + 1) % segments),
        c = ((ring + 1) % points.length) * segments + ((s + 1) % segments),
        d = ((ring + 1) % points.length) * segments + s;
      indices.set([a, c, b, a, d, c], (ring * segments + s) * 6);
    }
  });
  return { positions, indices };
}
