import polygonClipping from 'polygon-clipping';
import { detectIslands, type ContourPoint } from './islands.js';
import type { Path } from './index.js';
type Point = [number, number];
/** Subtract a full-width rectangle from even/odd cut regions to retain a bridge.
 * Linear simple contours only. A topology check must remove exactly one island.
 */
export function bridgeIsland(
  contours: readonly (readonly ContourPoint[])[],
  index: number,
  widthMm: number,
) {
  if (!Number.isFinite(widthMm) || widthMm < 0.5 || widthMm > 10 || !Number.isInteger(index))
    throw Error('INVALID_BRIDGE');
  const before = detectIslands(contours),
    island = before[index];
  if (!island?.isIsland || island.parent === null) throw Error('BRIDGE_NOT_ISLAND');
  const inner = contours[index]!,
    outer = contours[island.parent]!;
  let best = Infinity,
    start: Point = [0, 0],
    end: Point = [0, 0];
  function compare(
    points: readonly ContourPoint[],
    target: readonly ContourPoint[],
    reverse: boolean,
  ) {
    for (const p of points)
      for (let j = 0; j < target.length; j++) {
        const a = target[j]!,
          b = target[(j + 1) % target.length]!,
          dx = b[0] - a[0],
          dy = b[1] - a[1];
        const t = Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)),
        );
        const q: Point = [a[0] + t * dx, a[1] + t * dy],
          length = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (length < best) {
          best = length;
          start = reverse ? q : [...p];
          end = reverse ? [...p] : q;
        }
      }
  }
  compare(inner, outer, false);
  compare(outer, inner, true);
  if (best < 1e-6) throw Error('BRIDGE_NO_GAP');
  const ux = (end[0] - start[0]) / best,
    uy = (end[1] - start[1]) / best,
    r = widthMm / 2;
  const rectangle: Point[] = [
    [start[0] - ux * r - uy * r, start[1] - uy * r + ux * r],
    [end[0] + ux * r - uy * r, end[1] + uy * r + ux * r],
    [end[0] + ux * r + uy * r, end[1] + uy * r - ux * r],
    [start[0] - ux * r + uy * r, start[1] - uy * r - ux * r],
  ];
  const polygons = before
    .filter((item) => item.depth % 2 === 0)
    .map((item) => [
      contours[item.index]!.map((p) => [...p] as Point),
      ...before
        .filter((child) => child.parent === item.index)
        .map((child) => contours[child.index]!.map((p) => [...p] as Point)),
    ]);
  const clipped = polygonClipping.difference(polygons, [rectangle]);
  const result = clipped.flatMap((polygon) =>
    polygon.map((ring) => {
      const points = ring.map((p) => p.map((n) => Math.round(n * 1e6) / 1e6) as Point);
      if (
        points.length > 1 &&
        points[0]![0] === points.at(-1)![0] &&
        points[0]![1] === points.at(-1)![1]
      )
        points.pop();
      return points;
    }),
  );
  const after = detectIslands(result);
  if (
    after.filter((item) => item.isIsland).length !==
    before.filter((item) => item.isIsland).length - 1
  )
    throw Error('BRIDGE_TOPOLOGY');
  const area = (items: typeof before) =>
    items.reduce((sum, item) => sum + (item.depth % 2 ? -1 : 1) * item.areaMm2, 0);
  if (area(after) >= area(before) - 1e-7) throw Error('BRIDGE_NO_REMOVAL');
  const f = (n: number) => String(n);
  const paths: Path[] = result.map((points) => ({
    d: points.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`).join(' ') + ' Z',
  }));
  return { contours: result, paths, bridge: rectangle };
}
