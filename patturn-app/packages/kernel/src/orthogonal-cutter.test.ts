import { expect, it } from 'vitest';
import { buildOrthogonalCutter, orthogonalCutterProfile } from './orthogonal-cutter.js';
import { buildConvexCutter, type CutterPoint } from './convex-cutter.js';
import { validateMesh } from './mesh-validate.js';
const options = { heightMm: 20, wallMm: 1.6, tipMm: 0.6 };
const l: CutterPoint[] = [
  [0, 0],
  [80, 0],
  [80, 30],
  [30, 30],
  [30, 80],
  [0, 80],
];
const u: CutterPoint[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [70, 100],
  [70, 30],
  [30, 30],
  [30, 100],
  [0, 100],
];
const square: CutterPoint[] = [
  [0, 0],
  [40, 0],
  [40, 40],
  [0, 40],
];
it.each([l, u, [...l].reverse(), [...u, u[0]!]].map((points) => ({ points })))(
  'builds a deterministic positive watertight genus-one cutter from supported concave shapes %#',
  ({ points }) => {
    const before = JSON.stringify(points),
      mesh = buildOrthogonalCutter(points, options),
      report = validateMesh(mesh);
    expect(report.ok).toBe(true);
    expect(report.euler).toBe(0);
    expect(report.signedVolumeMm3).toBeGreaterThan(0);
    expect(JSON.stringify(points)).toBe(before);
    expect(buildOrthogonalCutter(points, options)).toEqual(mesh);
    // Orthogonal miter offset: A(d)-A(0)=perimeter*d+4*d*d, even with safe reflex corners.
    const perimeter = points.reduce((sum, p, i) => {
      const q = points[(i + 1) % points.length]!;
      return sum + Math.hypot(q[0] - p[0], q[1] - p[1]);
    }, 0);
    const area = (d: number) => perimeter * d + 4 * d * d;
    expect(report.signedVolumeMm3).toBeCloseTo(
      ((area(0.6) + 4 * area(1.1) + area(1.6)) * 3) / 6 + 14 * area(1.6) + 3 * area(4.6),
      1,
    );
  },
);
it('agrees exactly with the convex cutter on an axis-aligned square', () => {
  expect(buildOrthogonalCutter(square, options)).toEqual(buildConvexCutter(square, options));
});
it('offsets the reflex corner into the notch instead of replacing the contour with its hull', () => {
  const profile = orthogonalCutterProfile(l, options);
  expect(profile.points).toHaveLength(6);
  expect(profile.points[3]).toEqual([-10, -10]);
  expect(profile.loops[1]!.points[3]![0]).toBeCloseTo(-9.4, 10);
  expect(profile.loops[1]!.points[3]![1]).toBeCloseTo(-9.4, 10);
  expect(profile.width).toBe(80);
  expect(profile.depth).toBe(80);
});
it.each(
  [
    { points: [] },
    {
      points: [
        [0, 0],
        [80, 0],
        [0, 80],
      ],
    },
    {
      points: [
        [0, 0],
        [40, 0],
        [40, 40],
        [10, 10],
        [0, 40],
      ],
    },
    {
      points: [
        [0, 0],
        [40, 0],
        [40, 40],
        [40, 40],
        [0, 40],
      ],
    },
    {
      points: [
        [0, 0],
        [20, 0],
        [40, 0],
        [40, 40],
        [0, 40],
      ],
    },
    {
      points: [
        [0, 0],
        [Infinity, 0],
        [40, 40],
        [0, 40],
      ],
    },
    {
      points: [
        [0, 0],
        [151, 0],
        [151, 40],
        [0, 40],
      ],
    },
    {
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
    },
    // Narrow notch: preserving topology cannot be guaranteed for the grip offset.
    {
      points: [
        [0, 0],
        [80, 0],
        [80, 80],
        [45, 80],
        [45, 30],
        [35, 30],
        [35, 80],
        [0, 80],
      ],
    },
    // Crossing orthogonal contour, all segments nonzero and alternating axes.
    {
      points: [
        [0, 0],
        [80, 0],
        [80, 60],
        [20, 60],
        [20, -20],
        [60, -20],
        [60, 80],
        [0, 80],
      ],
    },
    { points: Array.from({ length: 66 }, (_, i) => [i, 0]) },
  ].map((x) => x),
)('rejects unsupported, crossing or insufficient-clearance contours %#', ({ points }) => {
  expect(() => buildOrthogonalCutter(points as unknown as CutterPoint[], options)).toThrow();
});
it('applies the clearance gate to the widest grip, not only the thin cutting tip', () => {
  const notch: CutterPoint[] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [58, 100],
    [58, 40],
    [42, 40],
    [42, 100],
    [0, 100],
  ];
  expect(() => buildOrthogonalCutter(notch, { ...options, wallMm: 0.8 })).not.toThrow();
  expect(() => buildOrthogonalCutter(notch, { ...options, wallMm: 3 })).toThrow('CLEARANCE');
});
it.each([{ heightMm: 9 }, { wallMm: 0.7 }, { tipMm: 2 }, { wallMm: 0.8, tipMm: 1.2 }])(
  'retains the cutter dimension constraints %j',
  (patch) => {
    expect(() => buildOrthogonalCutter(l, { ...options, ...patch })).toThrow();
  },
);

it('preserves fractional coordinates and is translation-invariant without mutating input', () => {
  const moved = l.map(([x, z]) => [x + 10.25, z - 30.5] as CutterPoint);
  const before = JSON.stringify(moved);
  expect(buildOrthogonalCutter(moved, options)).toEqual(buildOrthogonalCutter(l, options));
  expect(JSON.stringify(moved)).toBe(before);
});
it.each([0.8, 1, 1.2])(
  'supports equal tip/wall without a degenerate bevel where permitted: %j',
  (wallMm) => {
    const tipMm = Math.min(wallMm, 1.2);
    const mesh = buildOrthogonalCutter(u, { ...options, wallMm, tipMm });
    expect(validateMesh(mesh).ok).toBe(true);
  },
);
it.each([20, 25, 30, 40, 50])(
  'validates a family of well-separated U contours at notch width %j',
  (gap) => {
    const a = (100 - gap) / 2,
      b = (100 + gap) / 2;
    const contour: CutterPoint[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [b, 100],
      [b, 40],
      [a, 40],
      [a, 100],
      [0, 100],
    ];
    const profile = orthogonalCutterProfile(contour, options);
    // Reflex vertices still bound a nonempty notch even at the widest grip.
    const grip = profile.loops.at(-2)!;
    expect(grip.points[3]![0] - grip.points[6]![0]).toBeCloseTo(gap - 2 * profile.maxOffset, 8);
    expect(validateMesh(buildOrthogonalCutter(contour, options)).ok).toBe(true);
  },
);
it('refuses touching boundaries and adjacent backtracking without silently repairing them', () => {
  const touching: CutterPoint[] = [
    [0, 0],
    [80, 0],
    [80, 80],
    [40, 80],
    [40, 0],
    [20, 0],
    [20, 80],
    [0, 80],
  ];
  expect(() => buildOrthogonalCutter(touching, options)).toThrow();
  const backtrack: CutterPoint[] = [
    [0, 0],
    [60, 0],
    [40, 0],
    [40, 40],
    [0, 40],
  ];
  expect(() => buildOrthogonalCutter(backtrack, options)).toThrow();
});
