import type { CutterPoint } from '@patturn/kernel';
export type OrthogonalDragBox = { x: number; y: number; width: number; height: number };
export function orthogonalDragBox(points: readonly CutterPoint[]): OrthogonalDragBox {
  if (!points.length || points.some((p) => !p.every(Number.isFinite)))
    throw Error('ORTHOGONAL_DRAG_INVALID');
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  return {
    x: Math.min(...xs) - 20,
    y: Math.min(...ys) - 20,
    width: Math.max(...xs) - Math.min(...xs) + 40,
    height: Math.max(...ys) - Math.min(...ys) + 40,
  };
}
function viewport(x: number, y: number, width: number, height: number, box: OrthogonalDragBox) {
  if (
    ![x, y, width, height, box.x, box.y, box.width, box.height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    box.width <= 0 ||
    box.height <= 0
  )
    throw Error('ORTHOGONAL_DRAG_INVALID');
}
export function orthogonalDragPoint(
  x: number,
  y: number,
  width: number,
  height: number,
  box: OrthogonalDragBox,
): CutterPoint {
  viewport(x, y, width, height, box);
  return [
    Math.round(Math.max(-1000, Math.min(1000, box.x + (x / width) * box.width))),
    Math.round(Math.max(-1000, Math.min(1000, box.y + (y / height) * box.height))),
  ];
}
export function orthogonalDragHit(
  points: readonly CutterPoint[],
  x: number,
  y: number,
  width: number,
  height: number,
  box: OrthogonalDragBox,
): number | null {
  viewport(x, y, width, height, box);
  let nearest: number | null = null,
    distance = 144;
  points.forEach((p, i) => {
    const d =
      (((p[0] - box.x) / box.width) * width - x) ** 2 +
      (((p[1] - box.y) / box.height) * height - y) ** 2;
    if (d <= distance && (nearest === null || d < distance)) {
      nearest = i;
      distance = d;
    }
  });
  return nearest;
}
