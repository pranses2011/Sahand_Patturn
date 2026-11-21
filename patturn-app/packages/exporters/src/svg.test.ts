import { describe, expect, it } from 'vitest';
import { toSvg } from './index.js';
import { PATTERNS } from '@patturn/patterns';
const decode = (r: ReturnType<typeof toSvg>) => new TextDecoder().decode(r.bytes);
describe('Safe bounded SVG pattern export', () => {
  it('uses explicit physical stroke, rounded joins and a user-space canvas clip', () => {
    const text = decode(toSvg([{ d: 'M-10 0L100 0' }], 80, 40, { strokeMm: 3 }));
    expect(text).toContain('stroke-width="3"');
    expect(text).toContain('stroke-linecap="round"');
    expect(text).toContain('clipPathUnits="userSpaceOnUse"');
    expect(text).toContain('clip-path="url(#canvas)"');
    expect(text).toContain('width="80mm"');
    expect(text).toContain('height="40mm"');
    // Visual clipping is not destructive geometric trimming for cutting software.
    expect(text).toContain('M-10 0L100 0');
  });
  it.each([NaN, Infinity, 0, -1])('rejects invalid dimensions or stroke: %s', (n) => {
    expect(toSvg([], n, 10).ok).toBe(false);
    expect(toSvg([], 10, n).ok).toBe(false);
    expect(toSvg([], 10, 10, { strokeMm: n }).ok).toBe(false);
  });
  it.each([
    'M0 0"/><script>alert(1)</script>',
    'MNaN 0L1 1',
    'M0 0L1e999 0',
    'M0 0 &bad;',
    'nonsense',
  ])('rejects unsafe/nonfinite data: %s', (d) => {
    const r = toSvg([{ d }], 40, 40);
    expect(r.ok).toBe(false);
    expect(r.bytes).toBeUndefined();
  });
  it('accepts finite exponential notation and all twelve generated patterns', () => {
    expect(toSvg([{ d: 'M1e-3 0L+1.5 2E+1z' }], 40, 40).ok).toBe(true);
    for (const p of PATTERNS) {
      const paths = p.build({
        canvasW: 80,
        canvasH: 80,
        tileW: 40,
        tileH: 40,
        seed: 42,
        params: { ...p.defaults },
      });
      const r = toSvg(paths, 80, 80, { strokeMm: 1.5 });
      expect(r.ok, p.id).toBe(true);
      expect(decode(r)).not.toContain('stroke-width="0.5"');
    }
  });
});
