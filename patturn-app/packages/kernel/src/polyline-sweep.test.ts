import { expect, it } from 'vitest';
import { buildPolylineSweep, type SweepPoint } from './polyline-sweep';
import { validateMesh } from './mesh-validate';
const path: SweepPoint[] = [
  [0, 0, 0],
  [0, 80, 0],
  [40, 140, 20],
  [100, 180, 60],
];
it.each([24, 48, 128])(
  'preserves polygon-corrected cylinder volume at %i section segments',
  (segments) => {
    const mesh = buildPolylineSweep({
        path: [
          [0, 0, 0],
          [0, 80, 0],
        ],
        tubeRadius: 8,
        segments,
      }),
      report = validateMesh(mesh);
    expect(report.ok).toBe(true);
    expect(report.euler).toBe(2);
    expect(report.nonManifoldVertices).toBe(0);
    expect(report.signedVolumeMm3).toBeCloseTo(
      (segments / 2) * Math.sin((2 * Math.PI) / segments) * 8 ** 2 * 80,
      1,
    );
    expect(mesh.meta?.volumeMm3).toBe(report.signedVolumeMm3);
  },
);
it.each(
  (
    [
      [80, 0, 0],
      [0, 80, 0],
      [0, 0, 80],
      [80, 80, 80],
    ] as SweepPoint[]
  ).map((end) => ({ end })),
)('handles a straight path pointing at $end', ({ end }) => {
  expect(validateMesh(buildPolylineSweep({ path: [[0, 0, 0], end], tubeRadius: 8 })).ok).toBe(true);
});
it('builds a capped nonplanar sweep deterministically, with fixed-radius sections normal to the sampled tangents', () => {
  const before = structuredClone(path),
    mesh = buildPolylineSweep({ path, tubeRadius: 8 });
  expect(mesh).toEqual(buildPolylineSweep({ path, tubeRadius: 8 }));
  expect(path).toEqual(before);
  expect(mesh.positions.length / 3).toBe(path.length * 48 + 2);
  expect(mesh.indices.length / 3).toBe(2 * 48 * path.length);
  expect(validateMesh(mesh).ok).toBe(true);
  const directions = path.slice(1).map((point, i) => {
    const d = point.map((n, k) => n - path[i]![k]!) as [number, number, number];
    const len = Math.hypot(...d);
    return d.map((n) => n / len);
  });
  for (let i = 0; i < path.length; i++) {
    const raw =
      i === 0
        ? directions[0]!
        : i === path.length - 1
          ? directions.at(-1)!
          : directions[i - 1]!.map((n, k) => n + directions[i]![k]!);
    const length = Math.hypot(...raw),
      t = raw.map((n) => n / length);
    for (let s = 0; s < 48; s++) {
      const delta = Array.from(
        { length: 3 },
        (_, k) => mesh.positions[(i * 48 + s) * 3 + k]! - path[i]![k]!,
      );
      expect(Math.hypot(...delta)).toBeCloseTo(8, 4);
      expect(delta.reduce((sum, n, k) => sum + n * t[k]!, 0)).toBeCloseTo(0, 4);
    }
  }
});
it('keeps a constant binormal/section phase along a planar bent path rather than adding twist', () => {
  const planar: SweepPoint[] = [
    [0, 0, 0],
    [0, 80, 0],
    [40, 140, 0],
    [100, 180, 0],
  ];
  const mesh = buildPolylineSweep({ path: planar, tubeRadius: 8 });
  for (let i = 0; i < planar.length; i++) {
    // Initial normal is -Z for a +Y tangent; minimal transport around Z leaves it unchanged.
    expect(mesh.positions[i * 48 * 3]).toBeCloseTo(planar[i]![0], 5);
    expect(mesh.positions[i * 48 * 3 + 1]).toBeCloseTo(planar[i]![1], 5);
    expect(mesh.positions[i * 48 * 3 + 2]).toBeCloseTo(-8, 5);
  }
});
it.each([NaN, Infinity, 0, 1.9, 20.1])('rejects invalid tube radius %s', (tubeRadius) =>
  expect(() => buildPolylineSweep({ path, tubeRadius })).toThrow('POLYLINE_SWEEP_INVALID_OPTIONS'),
);
it.each([0, 23, 24.5, 129, NaN, Infinity])('rejects invalid section segments %s', (segments) =>
  expect(() => buildPolylineSweep({ path, tubeRadius: 8, segments })).toThrow(
    'POLYLINE_SWEEP_INVALID_OPTIONS',
  ),
);
it.each([
  { name: 'empty', p: [] },
  { name: 'one point', p: [[0, 0, 0]] },
  { name: 'too many', p: Array.from({ length: 65 }, (_, i) => [0, i * 20, 0]) },
])('rejects $name path', ({ p }) =>
  expect(() => buildPolylineSweep({ path: p as unknown as SweepPoint[], tubeRadius: 2 })).toThrow(
    'POLYLINE_SWEEP_PATH_LIMIT',
  ),
);
it.each(
  [null, [0, NaN, 0], [0, Infinity, 0], [501, 0, 0], [0, 0], [0, 0, 0, 1]].map((point) => ({
    point,
  })),
)('rejects malformed point $point', ({ point }) => {
  expect(() =>
    buildPolylineSweep({ path: [point, [0, 80, 0]] as unknown as SweepPoint[], tubeRadius: 8 }),
  ).toThrow('POLYLINE_SWEEP_INVALID_POINT');
});
it.each([
  {
    name: 'duplicate',
    p: [
      [0, 0, 0],
      [0, 0, 0],
    ],
    error: 'SHORT_EDGE',
  },
  {
    name: 'short',
    p: [
      [0, 0, 0],
      [0, 31.9, 0],
    ],
    error: 'SHORT_EDGE',
  },
  {
    name: 'reversal',
    p: [
      [0, 0, 0],
      [0, 80, 0],
      [0, 0, 0],
    ],
    error: 'SHARP_TURN',
  },
  {
    name: 'right angle',
    p: [
      [0, 0, 0],
      [0, 80, 0],
      [80, 80, 0],
    ],
    error: 'SHARP_TURN',
  },
])('rejects $name without repairing the path', ({ p, error }) =>
  expect(() => buildPolylineSweep({ path: p as unknown as SweepPoint[], tubeRadius: 8 })).toThrow(
    'POLYLINE_SWEEP_' + error,
  ),
);
it('rejects crossings of non-neighboring 3D centreline segments', () => {
  const crossing: SweepPoint[] = [
    [-100, -100, 0],
    [100, 100, 0],
    [180, 100, 0],
    [240, 40, 0],
    [240, -40, 0],
    [180, -100, 0],
    [100, -100, 0],
    [-100, 100, 0],
  ];
  expect(() => buildPolylineSweep({ path: crossing, tubeRadius: 2 })).toThrow(
    'POLYLINE_SWEEP_CLEARANCE',
  );
});
it('rejects closed and near-closed paths instead of silently welding their ends', () => {
  const loop: SweepPoint[] = Array.from({ length: 9 }, (_, i) => [
    50 * Math.cos((i * Math.PI) / 4),
    50 * Math.sin((i * Math.PI) / 4),
    0,
  ]);
  for (const last of [
    [50, 0, 0],
    [49.9, -0.2, 0],
  ] as SweepPoint[]) {
    loop[8] = last;
    expect(() => buildPolylineSweep({ path: loop, tubeRadius: 2 })).toThrow(
      'POLYLINE_SWEEP_CLEARANCE',
    );
  }
});
it.each([2, 20])('supports radius boundary %s with sufficient edge length', (tubeRadius) =>
  expect(
    validateMesh(
      buildPolylineSweep({
        path: [
          [0, -100, 0],
          [0, 100, 0],
        ],
        tubeRadius,
      }),
    ).ok,
  ).toBe(true),
);

it('rejects sparse paths and sparse point tuples before frame calculations', () => {
  for (const invalid of [new Array(2), [new Array(3), [0, 80, 0]]])
    expect(() =>
      buildPolylineSweep({ path: invalid as unknown as SweepPoint[], tubeRadius: 8 }),
    ).toThrow('POLYLINE_SWEEP_INVALID_POINT');
});
it('accepts the maximum number of points without duplicating seam vertices', () => {
  const points: SweepPoint[] = Array.from({ length: 64 }, (_, i) => [0, -252 + i * 8, 0]);
  const mesh = buildPolylineSweep({ path: points, tubeRadius: 2, segments: 24 });
  expect(mesh.positions.length / 3).toBe(64 * 24 + 2);
  expect(validateMesh(mesh).ok).toBe(true);
});
it('uses 3D clearance rather than rejecting separated paths merely crossing in XY projection', () => {
  const separated: SweepPoint[] = [
    [-100, -100, 0],
    [100, 100, 0],
    [180, 100, 0],
    [240, 40, 0],
    [240, -40, 0],
    [180, -100, 0],
    [100, -100, 10],
    [-100, 100, 10],
  ];
  expect(validateMesh(buildPolylineSweep({ path: separated, tubeRadius: 2 })).ok).toBe(true);
});
it('supports the turn boundary and exact minimum edge length without clamping', () => {
  const points: SweepPoint[] = [
    [0, 0, 0],
    [0, 80, 0],
    [80 * Math.sin(Math.PI / 3), 120, 0],
  ];
  expect(validateMesh(buildPolylineSweep({ path: points, tubeRadius: 20 })).ok).toBe(true);
});
