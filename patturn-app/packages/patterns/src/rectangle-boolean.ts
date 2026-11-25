import polygonClipping from 'polygon-clipping';
import { detectIslands, type ContourPoint } from './islands.js';
export type RectangleBooleanOperation = 'union' | 'difference' | 'intersection';
export type BooleanRectangle = { x: number; y: number; width: number; height: number };
/** Two single simple orthogonal contours; return ALL result rings, never select a region. */
export function booleanOrthogonalPolygons(
  points: readonly ContourPoint[],
  operand: readonly ContourPoint[],
  operation: RectangleBooleanOperation,
): [number, number][][] {
  for (const contour of [points, operand]) {
    if (contour.length < 4 || contour.length > 64) throw Error('RECTANGLE_BOOLEAN_INPUT');
    detectIslands([contour]);
    for (let i = 0; i < contour.length; i++) {
      const a = contour[i]!,
        b = contour[(i + 1) % contour.length]!;
      if ((a[0] === b[0]) === (a[1] === b[1])) throw Error('RECTANGLE_BOOLEAN_AXIS');
    }
  }
  const source: [number, number][][] = [points.map(([x, y]) => [x, y])],
    clip: [number, number][][] = [operand.map(([x, y]) => [x, y])];
  let result: ReturnType<typeof polygonClipping.union>;
  switch (operation) {
    case 'union':
      result = polygonClipping.union(source, clip);
      break;
    case 'difference':
      result = polygonClipping.difference(source, clip);
      break;
    case 'intersection':
      result = polygonClipping.intersection(source, clip);
      break;
    default:
      throw Error('RECTANGLE_BOOLEAN_OPERATION');
  }
  const contours = result.flatMap((polygon) =>
    polygon.map((ring) => {
      const open = ring.slice(0, -1);
      // Only exact collinear removal; no coordinate rounding, snapping, hull or ring dropping.
      return open
        .filter((p, i) => {
          const a = open[(i + open.length - 1) % open.length]!,
            b = open[(i + 1) % open.length]!;
          return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]));
        })
        .map(([px, py]): [number, number] => [px === 0 ? 0 : px, py === 0 ? 0 : py]);
    }),
  );
  detectIslands(contours);
  return contours;
}

/** Existing rectangle contract delegates without changing its bounds or ring-preserving semantics. */
export function booleanOrthogonalRectangle(
  points: readonly ContourPoint[],
  rectangle: BooleanRectangle,
  operation: RectangleBooleanOperation,
): [number, number][][] {
  const { x, y, width, height } = rectangle;
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    Math.abs(x) > 1000 ||
    Math.abs(y) > 1000 ||
    width <= 0 ||
    height <= 0 ||
    width > 150 ||
    height > 150
  )
    throw Error('RECTANGLE_BOOLEAN_RECTANGLE');
  return booleanOrthogonalPolygons(
    points,
    [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ],
    operation,
  );
}
