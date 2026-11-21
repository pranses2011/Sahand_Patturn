import { describe, expect, it } from 'vitest';
import { toDxf } from './index.js';
function arcs(d: string, bounds?: { width: number; height: number }) {
  const r = toDxf([{ d }], bounds);
  expect(r.ok).toBe(true);
  const rows = new TextDecoder().decode(r.bytes).trim().split('\n');
  const out: Record<string, number>[] = [];
  let arc: Record<string, number> | null = null;
  for (let i = 0; i < rows.length; i += 2) {
    if (rows[i] === '0') {
      if (arc) out.push(arc);
      arc = rows[i + 1] === 'ARC' ? {} : null;
    } else if (arc) arc[rows[i]!] = Number(rows[i + 1]);
  }
  return out;
}
describe('Circular SVG arc to DXF ARC', () => {
  it('converts absolute and relative semicircles with the correct center and sweep', () => {
    const a = arcs('M0 0a10 10 0 0 1 20 0')[0]!;
    expect(a['10']).toBe(10);
    expect(a['20']).toBe(0);
    expect(a['40']).toBe(10);
    expect(a['50']).toBe(180);
    expect(a['51']).toBe(360);
    expect(arcs('M0 0A10 10 0 0 1 20 0')).toEqual([a]);
    const reverse = arcs('M0 0a10 10 0 0 0 20 0')[0]!;
    expect(reverse['50']).toBe(0);
    expect(reverse['51']).toBe(180);
  });
  it('preserves a quarter circle rather than extending it into a full circle', () => {
    const a = arcs('M10 0A10 10 0 0 1 0 10')[0]!;
    expect(a['10']).toBeCloseTo(0);
    expect(a['20']).toBeCloseTo(0);
    expect(a['50']).toBeCloseTo(0);
    expect(a['51']).toBeCloseTo(90);
  });
  it('applies SVG radius correction when endpoints exceed the supplied diameter', () => {
    const a = arcs('M0 0a9.999 9.999 0 0 1 20 0')[0]!;
    expect(a['40']).toBe(10);
    expect(a['10']).toBe(10);
  });
  it('intersects the original arc interval with canvas clipping, excluding the opposite half', () => {
    expect(arcs('M0 0a10 10 0 0 1 20 0', { width: 20, height: 20 })).toEqual([]);
    const a = arcs('M0 0a10 10 0 0 0 20 0', { width: 10, height: 20 });
    expect(a).toHaveLength(1);
    expect(a[0]!['50']).toBeCloseTo(90);
    expect(a[0]!['51']).toBeCloseTo(180);
  });
  it.each(['M0 0a10 5 0 0 1 20 0', 'M0 0a10 10 0 2 1 20 0', 'M0 0a10 10 0 0 1 20 0L0 0'])(
    'rejects ellipses, bad flags and unparsed suffixes: %s',
    (d) => {
      expect(toDxf([{ d }]).ok).toBe(false);
    },
  );
});
