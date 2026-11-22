import { describe, it, expect } from 'vitest';
import { detectIslands, type ContourPoint } from './islands.js';
const square = (lo: number, hi: number): ContourPoint[] => [
  [lo, lo],
  [hi, lo],
  [hi, hi],
  [lo, hi],
];
describe('Validated closed-contour containment and stencil islands', () => {
  it('detects disconnected roots and nesting independent of winding and order', () => {
    const contours = [square(3, 7).reverse(), square(0, 10), square(4, 6), square(20, 25)];
    expect(
      detectIslands(contours).map(({ parent, depth, isIsland }) => ({ parent, depth, isIsland })),
    ).toEqual([
      { parent: 1, depth: 1, isIsland: true },
      { parent: null, depth: 0, isIsland: false },
      { parent: 0, depth: 2, isIsland: false },
      { parent: null, depth: 0, isIsland: false },
    ]);
    expect(detectIslands(contours)[0]!.areaMm2).toBe(16);
  });
  it('supports a depth-three retained island and does not mutate inputs', () => {
    const contours = [square(0, 20), square(2, 18), square(4, 16), square(6, 14)],
      before = JSON.stringify(contours);
    expect(detectIslands(contours).map((item) => item.isIsland)).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect(JSON.stringify(contours)).toBe(before);
    expect(detectIslands([])).toEqual([]);
  });
  it.each(
    (
      [
        [square(0, 10), square(5, 15)],
        [square(0, 10), square(10, 20)],
        [square(0, 10), square(0, 10)],
        [
          [
            [0, 0],
            [10, 10],
            [0, 10],
            [8, 0],
          ],
        ],
        [
          [
            [0, 0],
            [10, 0],
            [5, 0],
            [5, 10],
            [0, 10],
          ],
        ],
        [
          [
            [0, 0],
            [1, 0],
            [0, 0],
          ],
        ],
        [
          [
            [0, 0],
            [1, 0],
            [Infinity, 1],
          ],
        ],
      ] as ContourPoint[][][]
    ).map((contours) => ({ contours })),
  )('rejects crossings, tangencies, overlaps and invalid rings %j', ({ contours }) => {
    expect(() => detectIslands(contours)).toThrow();
  });
  it('rejects input beyond the explicit complexity budget', () => {
    expect(() => detectIslands(Array.from({ length: 513 }, () => square(0, 1)))).toThrow(
      'ISLAND_COMPLEXITY',
    );
    expect(() => detectIslands([Array.from({ length: 4097 }, () => [0, 0] as const)])).toThrow(
      'ISLAND_COMPLEXITY',
    );
  });
  it('uses point-in-polygon rather than bounding boxes for concave containment', () => {
    const c: ContourPoint[] = [
      [0, 0],
      [10, 0],
      [10, 2],
      [2, 2],
      [2, 10],
      [0, 10],
    ];
    expect(detectIslands([c, square(5, 6)])[1]!.parent).toBeNull();
  });
});
