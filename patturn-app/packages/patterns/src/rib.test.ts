import { describe, expect, it } from 'vitest';
import { buildRib } from './rib.js';
const profile = [
  { r: 40, y: -4 },
  { r: 60, y: 40 },
  { r: 30, y: 100 },
];
describe('Sampled-profile planar rib', () => {
  it('preserves the sampled contact edge and a bounded horizontal stock', () => {
    const result = buildRib(profile, 20);
    expect(result.contact).toEqual([
      [30, 104],
      [50, 60],
      [20, 0],
    ]);
    expect(result.width).toBeCloseTo(50, 4);
    expect(result.height).toBeCloseTo(104, 4);
    expect(result.paths[0]!.d).toBe('M30 104 L50 60 L20 0 L0 0 L0 104 Z');
  });
  it('is deterministic, translation invariant and leaves caller data untouched', () => {
    const before = structuredClone(profile);
    expect(buildRib(profile, 20)).toEqual(buildRib(profile, 20));
    expect(
      buildRib(
        profile.map((p) => ({ r: p.r + 10, y: p.y + 500 })),
        20,
      ),
    ).toEqual(buildRib(profile, 20));
    expect(profile).toEqual(before);
  });
  it.each([5, 20, 80])('supports straight cylinder profiles and backing %s', (backing) => {
    const result = buildRib(
      [
        { r: 30, y: 0 },
        { r: 30, y: 100 },
      ],
      backing,
    );
    expect(result.width).toBeCloseTo(backing, 4);
    expect(result.contact).toEqual([
      [backing, 100],
      [backing, 0],
    ]);
  });
  it.each([NaN, Infinity, 4, 81])('rejects invalid backing %s', (backing) => {
    expect(() => buildRib(profile, backing)).toThrow('RIB_INVALID_BACKING');
  });
  it.each(
    [
      [],
      [{ r: 1, y: 0 }],
      [
        { r: 1, y: 1 },
        { r: 2, y: 1 },
      ],
      [
        { r: 1, y: 2 },
        { r: 2, y: 1 },
      ],
      [
        { r: -1, y: 0 },
        { r: 2, y: 1 },
      ],
      [
        { r: NaN, y: 0 },
        { r: 2, y: 1 },
      ],
      [
        { r: 1, y: 0 },
        { r: 2, y: Infinity },
      ],
      [
        { r: 1, y: 0 },
        { r: 2, y: 1001 },
      ],
      [
        { r: 0, y: 0 },
        { r: 1000, y: 100 },
      ],
      [
        { r: 1, y: 0 },
        { r: 2, y: 0.5 },
      ],
      Array.from({ length: 513 }, (_, i) => ({ r: 1, y: i })),
    ].map((invalid) => ({ invalid })),
  )('rejects unsupported or oversized profiles %#', ({ invalid }) => {
    expect(() => buildRib(invalid, 20)).toThrow(/RIB_/);
  });
});
