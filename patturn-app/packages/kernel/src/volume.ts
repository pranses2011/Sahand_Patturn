/**
 * Volume / capacity / shrink calculations (golden formulas from the analysis).
 * - capacity: frustum sum over inner profile
 * - filled: integral up to fill height
 * - shrink: linear and volumetric
 */
import type { Profile } from './profile.js';

const ML_PER_MM3 = 1 / 1000;

/** Capacity in ml by summing frustums between consecutive inner samples. */
export function capacityMl(profile: Profile): number {
  let mm3 = 0;
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i]!,
      b = profile[i + 1]!;
    const h = b.y - a.y;
    if (h <= 0) continue;
    mm3 += (Math.PI * h * (a.r * a.r + a.r * b.r + b.r * b.r)) / 3;
  }
  return mm3 * ML_PER_MM3;
}

/** Filled volume in ml up to `fill` (0..1) of the profile height. */
export function filledMl(profile: Profile, fill: number): number {
  const y0 = profile[0]!.y;
  const y1 = profile[profile.length - 1]!.y;
  const yFill = y0 + fill * (y1 - y0);
  let mm3 = 0;
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i]!,
      b = profile[i + 1]!;
    if (b.y <= y0) continue;
    if (a.y >= yFill) break;
    // clip segment to [.., yFill]
    const t = Math.min(1, Math.max(0, (yFill - a.y) / (b.y - a.y)));
    const rEnd = a.r + t * (b.r - a.r);
    const yEnd = a.y + t * (b.y - a.y);
    const h = yEnd - a.y;
    if (h <= 0) continue;
    mm3 += (Math.PI * h * (a.r * a.r + a.r * rEnd + rEnd * rEnd)) / 3;
  }
  return mm3 * ML_PER_MM3;
}

/** Shrink: dry dimension = wet × (1 − s). */
export function shrinkDim(wetMm: number, shrink: number): number {
  return wetMm * (1 - shrink);
}

/** Dry capacity = wet × (1 − s)³. */
export function shrinkVolume(wetMl: number, shrink: number): number {
  return wetMl * Math.pow(1 - shrink, 3);
}

/**
 * Plaster/water mix for a mold volume (site-validated):
 *   ρ_p = 2.75 kg/L, r_w = 0.70 (water:plaster)
 *   P = V / (1/2.75 + 0.70), W = 0.70 · P
 *   For V = 1.84 L → P ≈ 1.7299 kg, W ≈ 1.2109 kg  (site shows 1.72 / 1.20)
 */
export function plasterMix(volumeL: number, rhoPlaster = 2.75, waterRatio = 0.7) {
  const P = volumeL / (1 / rhoPlaster + waterRatio);
  const W = waterRatio * P;
  return {
    plasterKg: P,
    waterKg: W,
    mixDensityKgL: (P + W) / volumeL,
  };
}

/** Mold target: scale wet form by 1/(1−s) so the fired piece hits final size. */
export function moldScale(shrink: number): number {
  return 1 / (1 - shrink);
}
