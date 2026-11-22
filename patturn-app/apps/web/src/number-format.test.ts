import { it, expect } from 'vitest';
import { formatNumber } from './number-format';
it('formats Persian numerals, grouping, fixed decimals and negatives deterministically', () => {
  expect(formatNumber(1234.5, 2)).toBe('۱٬۲۳۴٫۵۰');
  expect(formatNumber(4)).toBe('۴');
  expect(formatNumber(0.000123, 6)).toBe('۰٫۰۰۰۱۲۳');
  expect(formatNumber(-0)).toBe('۰');
  expect(formatNumber(-2.5, 1)).toContain('۲٫۵');
  expect(formatNumber(0, 0)).toBe('۰');
});
it('does not expose nonfinite/absent results and validates display precision', () => {
  for (const n of [NaN, Infinity, -Infinity, null, undefined]) expect(formatNumber(n)).toBe('—');
  for (const digits of [-1, 9, 1.5])
    expect(() => formatNumber(1, digits)).toThrow('INVALID_DISPLAY_PRECISION');
});
