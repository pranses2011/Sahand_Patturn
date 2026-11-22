export type ContourPoint = readonly [number, number];
/** Linear, simple, disjoint closed contours; an implicit closing edge is used.
 * Even-odd cut semantics: depth 0 encloses a cut, odd depths enclose retained islands.
 * Touching/crossing geometry is rejected, never guessed from one probe point.
 */
export function detectIslands(contours: readonly (readonly ContourPoint[])[]) {
  if (contours.length > 512 || contours.reduce((n, p) => n + p.length, 0) > 4096)
    throw Error('ISLAND_COMPLEXITY');
  const epsilon = 1e-7;
  const cross = (a: ContourPoint, b: ContourPoint, c: ContourPoint) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const on = (a: ContourPoint, b: ContourPoint, p: ContourPoint) =>
    Math.abs(cross(a, b, p)) <= epsilon &&
    p[0] >= Math.min(a[0], b[0]) - epsilon &&
    p[0] <= Math.max(a[0], b[0]) + epsilon &&
    p[1] >= Math.min(a[1], b[1]) - epsilon &&
    p[1] <= Math.max(a[1], b[1]) + epsilon;
  const intersects = (a: ContourPoint, b: ContourPoint, c: ContourPoint, d: ContourPoint) => {
    if (on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b)) return true;
    return cross(a, b, c) > 0 !== cross(a, b, d) > 0 && cross(c, d, a) > 0 !== cross(c, d, b) > 0;
  };
  const areas = contours.map((p) => {
    if (
      p.length < 3 ||
      p.some((v) => v.length !== 2 || v.some((n) => !Number.isFinite(n) || Math.abs(n) > 10000))
    )
      throw Error('INVALID_ISLAND_CONTOUR');
    let area = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i]!,
        b = p[(i + 1) % p.length]!;
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= epsilon) throw Error('INVALID_ISLAND_CONTOUR');
      area += a[0] * b[1] - b[0] * a[1];
      // Adjacent edges may share an endpoint, but must not backtrack/overlap.
      const c = p[(i + 2) % p.length]!;
      if (Math.abs(cross(a, b, c)) <= epsilon && on(a, b, c)) throw Error('INVALID_ISLAND_CONTOUR');
    }
    if (Math.abs(area) <= epsilon) throw Error('INVALID_ISLAND_CONTOUR');
    return Math.abs(area) / 2;
  });
  for (let i = 0; i < contours.length; i++)
    for (let j = i; j < contours.length; j++) {
      const p = contours[i]!,
        q = contours[j]!;
      for (let a = 0; a < p.length; a++)
        for (let b = i === j ? a + 1 : 0; b < q.length; b++) {
          if (i === j && (b === a + 1 || (a === 0 && b === p.length - 1))) continue;
          if (intersects(p[a]!, p[(a + 1) % p.length]!, q[b]!, q[(b + 1) % q.length]!))
            throw Error('ISLAND_CONTOURS_INTERSECT');
        }
    }
  function inside(point: ContourPoint, polygon: readonly ContourPoint[]) {
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i]!,
        b = polygon[j]!;
      if (
        a[1] > point[1] !== b[1] > point[1] &&
        point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
      )
        result = !result;
    }
    return result;
  }
  const parents = contours.map((p, i) => {
    let parent: number | null = null;
    contours.forEach((q, j) => {
      if (
        i !== j &&
        areas[j]! > areas[i]! &&
        inside(p[0]!, q) &&
        (parent === null || areas[j]! < areas[parent]!)
      )
        parent = j;
    });
    return parent;
  });
  return contours.map((_, index) => {
    let depth = 0,
      parent = parents[index]!;
    while (parent !== null) {
      depth++;
      parent = parents[parent]!;
    }
    return {
      index,
      parent: parents[index]!,
      depth,
      isIsland: depth % 2 === 1,
      areaMm2: areas[index]!,
    };
  });
}
