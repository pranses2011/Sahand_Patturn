import { describe, it, expect } from 'vitest';
import { bridgeIsland } from './bridge.js';
import { detectIslands, type ContourPoint } from './islands.js';
const square = (lo: number, hi: number): ContourPoint[] => [
  [lo, lo],
  [hi, lo],
  [hi, hi],
  [lo, hi],
];
describe('Boolean removal of cut geometry to retain a real bridge', () => {
  it.each([0.5, 2, 10])('connects nested island with a %s mm bridge', (width) => {
    const input = [square(0, 40), square(10, 30)],
      before = JSON.stringify(input);
    const out = bridgeIsland(input, 1, width);
    expect(detectIslands(out.contours).filter((item) => item.isIsland)).toHaveLength(0);
    expect(out.contours).toHaveLength(1);
    expect(JSON.stringify(input)).toBe(before);
    expect(out).toEqual(bridgeIsland(input, 1, width));
    expect(
      Math.hypot(out.bridge[0]![0] - out.bridge[3]![0], out.bridge[0]![1] - out.bridge[3]![1]),
    ).toBeCloseTo(width, 6);
    expect(detectIslands(out.contours)[0]!.areaMm2).toBeCloseTo(
      1200 - width * 10 - width ** 2 / 4,
      5,
    );
  });
  it('preserves a separate cut and allows bridging each remaining island sequentially', () => {
    const input = [square(0, 80), square(10, 20), square(50, 60), square(100, 110)];
    const first = bridgeIsland(input, 1, 2),
      items = detectIslands(first.contours);
    expect(items.filter((item) => item.isIsland)).toHaveLength(1);
    const index = items.find((item) => item.isIsland)!.index;
    const second = bridgeIsland(first.contours, index, 3);
    expect(detectIslands(second.contours).filter((item) => item.isIsland)).toHaveLength(0);
  });
  it.each([0, NaN, 11])('rejects invalid width %s', (width) => {
    expect(() => bridgeIsland([square(0, 40), square(10, 30)], 1, width)).toThrow('INVALID_BRIDGE');
  });
  it('rejects non-island selection and intersecting input', () => {
    expect(() => bridgeIsland([square(0, 40)], 0, 2)).toThrow('BRIDGE_NOT_ISLAND');
    expect(() => bridgeIsland([square(0, 40), square(30, 50)], 1, 2)).toThrow();
  });
});
