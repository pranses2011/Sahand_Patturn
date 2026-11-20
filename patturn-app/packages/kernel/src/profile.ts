/**
 * Profile curves — analytic reference form + node-based (Bézier) profiles.
 * All units mm (iron rule #1).
 */
export interface ProfilePoint {
  /** radius (mm) — always >= 0, profile is revolved around Y axis */
  r: number;
  /** height (mm) */
  y: number;
}

/** Sampled profile: list of points from bottom to top. */
export type Profile = ProfilePoint[];

/**
 * Reference form (golden fixture):
 *   outer: w=145mm (r_out_max=72.5), h=148mm, wall=4mm
 *   inner radius law: r(y) = RT + (RB - RT) * (1 - y/H)^P   for y in [0, H], H=144
 *   capacity  = 1131.000 ml  ·  fill 80% = 958.000 ml  (within ±0.001%)
 */
export const REFERENCE = {
  heightOuter: 148,
  wall: 4,
  widthOuter: 145,
  /** inner height = heightOuter - wall (floor) */
  get H() {
    return this.heightOuter - this.wall; // 144
  },
  /** inner max radius at bottom: widthOuter/2 - wall = 72.5 - 4 = 68.5 */
  get RB() {
    return this.widthOuter / 2 - this.wall; // 68.5
  },
  RT: 43.6965, // inner radius at rim (fitted)
  P: 3.25983, // taper exponent (fitted)
  fillLevel: 0.8,
  shrink: 0.12,
  expectedCapacityMl: 1131,
  expectedFilledMl: 958,
} as const;

/** Inner radius law of the reference form at height y (0..H). */
export function referenceInnerRadius(y: number): number {
  const H = REFERENCE.heightOuter - REFERENCE.wall;
  const t = Math.min(Math.max(y / H, 0), 1);
  return REFERENCE.RT + (REFERENCE.RB - REFERENCE.RT) * Math.pow(1 - t, REFERENCE.P);
}

/** Inner profile of the reference form as a sampled Profile (N segments). */
export function referenceProfile(samples = 64): Profile {
  const H = REFERENCE.heightOuter - REFERENCE.wall;
  const pts: ProfilePoint[] = [];
  for (let i = 0; i <= samples; i++) {
    const y = (i / samples) * H;
    pts.push({ r: referenceInnerRadius(y), y });
  }
  return pts;
}

/** Outer profile = inner radius + wall (offset outward), floor included. */
export function referenceOuterProfile(samples = 64): Profile {
  const inner = referenceProfile(samples);
  const floorY = -REFERENCE.wall;
  const outer: ProfilePoint[] = [{ r: 0, y: floorY }, { r: REFERENCE.RB + REFERENCE.wall, y: floorY }];
  for (const p of inner) outer.push({ r: p.r + REFERENCE.wall, y: p.y });
  // rim lip: close top from inner rim to outer rim
  const top = inner[inner.length - 1]!;
  outer.push({ r: top.r, y: top.y });
  return outer;
}

/** Catmull-Rom through nodes → dense sample (for user-edited profiles). */
export function catmullRom(nodes: ProfilePoint[], samplesPerSeg = 12): Profile {
  if (nodes.length < 2) return [...nodes];
  const pts: ProfilePoint[] = [];
  const ext: ProfilePoint[] = [
    { r: nodes[0]!.r * 2 - nodes[1]!.r, y: nodes[0]!.y * 2 - nodes[1]!.y },
    ...nodes,
    {
      r: nodes[nodes.length - 1]!.r * 2 - nodes[nodes.length - 2]!.r,
      y: nodes[nodes.length - 1]!.y * 2 - nodes[nodes.length - 2]!.y,
    },
  ];
  for (let i = 1; i < ext.length - 2; i++) {
    const p0 = ext[i - 1]!, p1 = ext[i]!, p2 = ext[i + 1]!, p3 = ext[i + 2]!;
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg;
      const t2 = t * t, t3 = t2 * t;
      const cr = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push({ r: Math.max(0, cr(p0.r, p1.r, p2.r, p3.r)), y: cr(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  pts.push({ ...nodes[nodes.length - 1]! });
  return pts;
}

/** Validate a profile: no self-intersection in radius, monotone y not required but r >= 0. */
export function validateProfile(p: Profile): string | null {
  if (p.length < 2) return 'PROFILE_TOO_SHORT';
  for (const pt of p) {
    if (pt.r < 0) return 'NEGATIVE_RADIUS';
    if (!Number.isFinite(pt.r) || !Number.isFinite(pt.y)) return 'NON_FINITE';
  }
  return null;
}
