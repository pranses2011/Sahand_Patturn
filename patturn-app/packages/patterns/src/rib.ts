import type { Path } from './index.js';

/** Planar inside rib: sampled contact edge plus a straight backing.
 * Width is horizontal stock, not a normal offset or a fabrication allowance.
 */
export function buildRib(
  profile: readonly { readonly r: number; readonly y: number }[],
  backingMm: number,
) {
  if (!Number.isFinite(backingMm) || backingMm < 5 || backingMm > 80)
    throw Error('RIB_INVALID_BACKING');
  if (profile.length < 2 || profile.length > 512) throw Error('RIB_PROFILE_LIMIT');
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i]!;
    if (
      !Number.isFinite(p.r) ||
      p.r < 0 ||
      p.r > 1000 ||
      !Number.isFinite(p.y) ||
      Math.abs(p.y) > 10000 ||
      (i > 0 && p.y <= profile[i - 1]!.y)
    )
      throw Error('RIB_INVALID_PROFILE');
  }
  const bottom = profile[0]!.y,
    top = profile.at(-1)!.y;
  const height = top - bottom;
  const minR = Math.min(...profile.map((p) => p.r));
  const width = Math.max(...profile.map((p) => p.r)) - minR + backingMm;
  if (height < 1 || height > 1000 || width > 1000) throw Error('RIB_DIMENSION_LIMIT');
  // Coordinates are rounded to 1nm for portable SVG text. Margin contains rounding.
  const f = (v: number) => String(Math.round(v * 1e6) / 1e6);
  const contact = profile.map((p) => [p.r - minR + backingMm, top - p.y] as const);
  const points = [...contact, [0, 0] as const, [0, height] as const];
  const paths: Path[] = [
    {
      d: points.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join(' ') + ' Z',
    },
  ];
  return { paths, width: width + 1e-5, height: height + 1e-5, contact, backingMm };
}
