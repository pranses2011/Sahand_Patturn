/**
 * Mold analysis — undercut detection, parting suggestion, keys, plaster mix.
 * Full CSG boolean lives behind the kernel's manifold adapter (see 07 spec);
 * here: the decision logic that must be unit-tested without a mesher.
 */
import { capacityMl, plasterMix, type Profile } from '@patturn/kernel';

export interface UndercutReport {
  dropOutSafe: boolean;
  /** y positions (mm) where dr/dy < 0 (narrowing upward) */
  problemBands: [number, number][];
  suggestedParts: number;
}

/**
 * Drop-out single-piece criterion (site spec): for every y bottom→top, dr/dy ≥ 0.
 * We sample the profile; small negative slopes below tolerance are allowed.
 */
export function analyzeUndercut(profile: Profile, tolerance = 0.001): UndercutReport {
  const bands: [number, number][] = [];
  let bandStart: number | null = null;
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i]!,
      b = profile[i + 1]!;
    const dy = b.y - a.y;
    if (dy <= 0) continue;
    const slope = (b.r - a.r) / dy;
    if (slope < -tolerance) {
      if (bandStart === null) bandStart = a.y;
    } else if (bandStart !== null) {
      bands.push([bandStart, a.y]);
      bandStart = null;
    }
  }
  if (bandStart !== null) {
    bands.push([bandStart, profile[profile.length - 1]!.y]);
  }
  const dropOutSafe = bands.length === 0;
  // heuristic: one split per major band, min 2 parts if unsafe
  const suggestedParts = dropOutSafe ? 1 : Math.min(8, Math.max(2, bands.length + 1));
  return { dropOutSafe, problemBands: bands, suggestedParts };
}

export interface SplitPlan {
  kind: 'none' | 'horizontal' | 'vertical';
  /** profile-space y of the horizontal parting plane (mm); 0 for vertical/none */
  y: number;
  normal: [number, number, number];
  offset: number;
  parts: number;
  /** lower is better: none=10, horizontal=20, vertical=21 */
  score: number;
  /** min-side volume fraction 0..0.5 (0 for none) */
  balance: number;
  reason: string;
}

/**
 * Automatic split selection (checklist 6.4) — score function over parting candidates.
 * - drop-out safe → single piece (score 10)
 * - else best horizontal plane at an interior profile vertex (score 20)
 * - else vertical plane through the axis (score 21; always works for axisymmetric forms)
 */
export function chooseSplitPlanes(profile: Profile, tolerance = 0.001): SplitPlan {
  const rep = analyzeUndercut(profile, tolerance);
  if (rep.dropOutSafe) {
    return {
      kind: 'none',
      y: 0,
      normal: [0, 1, 0],
      offset: 0,
      parts: 1,
      score: 10,
      balance: 0,
      reason: 'drop-out safe — قالب تک‌تکه',
    };
  }
  // per-segment slopes (null for zero-height segments)
  const slopes: (number | null)[] = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i]!,
      b = profile[i + 1]!;
    const dy = b.y - a.y;
    slopes.push(dy > 0 ? (b.r - a.r) / dy : null);
  }
  // a horizontal split at vertex i is valid iff no undercut below it
  // (slopes ≥ −tol) and no undercut above it when inverted (slopes ≤ +tol)
  let bestY: number | null = null;
  for (let i = 1; i < profile.length - 1; i++) {
    const belowOk = slopes.slice(0, i).every((s) => s === null || s >= -tolerance);
    const aboveOk = slopes.slice(i).every((s) => s === null || s <= tolerance);
    if (belowOk && aboveOk) {
      const y = profile[i]!.y;
      if (bestY === null || y > bestY) bestY = y;
    }
  }
  if (bestY !== null) {
    // balance = min-side fraction of ∫ r² dy (volume proxy)
    let total = 0,
      below = 0;
    for (let i = 0; i < profile.length - 1; i++) {
      const a = profile[i]!,
        b = profile[i + 1]!;
      const dy = b.y - a.y;
      if (dy <= 0) continue;
      const seg = ((a.r * a.r + b.r * b.r) / 2) * dy;
      total += seg;
      if (b.y <= bestY) below += seg;
      else if (a.y < bestY) below += (seg * (bestY - a.y)) / dy;
    }
    const balance = total > 0 ? Math.min(below, total - below) / total : 0;
    return {
      kind: 'horizontal',
      y: bestY,
      normal: [0, 1, 0],
      offset: bestY,
      parts: 2,
      score: 20,
      balance,
      reason: `افقی در y=${bestY.toFixed(1)}mm`,
    };
  }
  return {
    kind: 'vertical',
    y: 0,
    normal: [0, 0, 1],
    offset: 0,
    parts: 2,
    score: 21,
    balance: 0.5,
    reason: 'عمودی از محور (z=0)',
  };
}

export interface KeySpec {
  type: 'tapered-cylinder' | 'hemisphere';
  /** base radius mm (site default Ø16 → r=8) */
  r: number;
  /** height mm (site default 10) */
  h: number;
  /** taper degrees (site default 4°) */
  taperDeg: number;
  /** clearance mm (site default 0.20) */
  clearance: number;
}

export const DEFAULT_KEY: KeySpec = {
  type: 'tapered-cylinder',
  r: 8,
  h: 10,
  taperDeg: 4,
  clearance: 0.2,
};

/** Male key top radius = r + h·tan(taper) (site formula). */
export function keyTopRadius(k: KeySpec = DEFAULT_KEY): number {
  return k.r + k.h * Math.tan((k.taperDeg * Math.PI) / 180);
}

/** Female socket radius = male radius + clearance (per side). */
export function socketRadius(k: KeySpec = DEFAULT_KEY): number {
  return keyTopRadius(k) + k.clearance;
}

/** Key volume (frustum) in mm³ → material estimate. */
export function keyVolumeMm3(k: KeySpec = DEFAULT_KEY): number {
  const r1 = k.r,
    r2 = keyTopRadius(k);
  return (Math.PI * k.h * (r1 * r1 + r1 * r2 + r2 * r2)) / 3;
}

export interface MoldBlock {
  /** outer block size */
  w: number;
  d: number;
  h: number;
  wall: number; // site default 25
  base: number; // site default 20
  draftDeg: number; // site default 1.5
}

export function moldBlockFor(
  bbox: { min: [number, number, number]; max: [number, number, number] },
  wall = 25,
  base = 20,
): MoldBlock {
  const w = bbox.max[0] - bbox.min[0];
  const d = bbox.max[2] - bbox.min[2];
  const h = bbox.max[1] - bbox.min[1];
  return { w: w + wall * 2, d: d + wall * 2, h: h + base + wall, wall, base, draftDeg: 1.5 };
}

/** Plaster needed for a mold cavity (mm³ → L → kg). Site: 1.84 L → 1.73/1.21. */
export function plasterForCavity(cavityMm3: number) {
  const L = cavityMm3 / 1e6;
  return { volumeL: L, ...plasterMix(L) };
}

/** Silicone mother mold: 1.10–1.20 kg/L (site spec). */
export function siliconeFor(volumeMm3: number, density = 1.15) {
  const L = volumeMm3 / 1e6;
  return { volumeL: L, kg: L * density };
}

export { capacityMl };

export * from './csg.js';
