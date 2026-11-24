import type { Point2 } from './bezier.js';
export interface SvgArc {
  rx: number;
  ry: number;
  rotation: number;
  large: number;
  sweep: number;
  end: Point2;
}
/** SVG endpoint-to-center conversion followed by chord approximation.
 * For the ellipse parametrisation ||p''(theta)|| <= max(rx,ry), so the linear
 * interpolation error is <= maxRadius * stepAngle^2 / 8 (plus floating point).
 */
export function flattenSvgArc(start: Point2, arc: SvgArc, tolerance: number): Point2[] {
  const { end, rotation, large, sweep } = arc;
  if (
    ![...start, ...end, arc.rx, arc.ry, rotation].every(
      (n) => Number.isFinite(n) && Math.abs(n) <= 1e7,
    ) ||
    ![0, 1].includes(large) ||
    ![0, 1].includes(sweep) ||
    !Number.isFinite(tolerance) ||
    tolerance < 0.001 ||
    tolerance > 1
  )
    throw Error('DXF_INVALID_ARC_OPTIONS');
  let rx = Math.abs(arc.rx),
    ry = Math.abs(arc.ry);
  if (start[0] === end[0] && start[1] === end[1]) return [[...start]];
  if (rx === 0 || ry === 0) return [[...start], [...end]];
  const phi = ((rotation % 360) * Math.PI) / 180,
    cos = Math.cos(phi),
    sin = Math.sin(phi);
  const dx = (start[0] - end[0]) / 2,
    dy = (start[1] - end[1]) / 2;
  const xp = cos * dx + sin * dy,
    yp = -sin * dx + cos * dy;
  const correction = Math.hypot(xp / rx, yp / ry);
  if (correction > 1) {
    rx *= correction;
    ry *= correction;
  }
  if (!Number.isFinite(rx) || !Number.isFinite(ry) || Math.max(rx, ry) > 1e7)
    throw Error('DXF_ARC_RADIUS_LIMIT');
  // Normalised coordinates avoid products of four squared radii.
  const nx = xp / rx,
    ny = yp / ry,
    lambda = nx * nx + ny * ny;
  if (lambda === 0 || !Number.isFinite(lambda)) throw Error('DXF_ARC_NUMERIC_LIMIT');
  const sign = large === sweep ? -1 : 1,
    factor = sign * Math.sqrt(Math.max(0, (1 - lambda) / lambda));
  const cxp = factor * rx * ny,
    cyp = -factor * ry * nx;
  const cx = cos * cxp - sin * cyp + (start[0] + end[0]) / 2,
    cy = sin * cxp + cos * cyp + (start[1] + end[1]) / 2;
  const ux = (xp - cxp) / rx,
    uy = (yp - cyp) / ry,
    vx = (-xp - cxp) / rx,
    vy = (-yp - cyp) / ry;
  const first = Math.atan2(uy, ux);
  let delta = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const count = Math.max(
    1,
    Math.ceil(Math.abs(delta) / Math.sqrt((8 * tolerance) / Math.max(rx, ry))),
  );
  if (count > 16384) throw Error('DXF_ARC_COMPLEXITY_LIMIT');
  const result: Point2[] = [[...start]];
  for (let i = 1; i < count; i++) {
    const theta = first + (delta * i) / count,
      x = rx * Math.cos(theta),
      y = ry * Math.sin(theta);
    const p: Point2 = [cx + cos * x - sin * y, cy + sin * x + cos * y];
    if (!p.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e7))
      throw Error('DXF_ARC_COORDINATE_LIMIT');
    result.push(p);
  }
  result.push([...end]);
  return result;
}
