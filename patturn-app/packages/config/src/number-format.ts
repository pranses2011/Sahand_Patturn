/** Presentation only: never use this output as geometry, JSON or filename input. */
const formats = new Map<number | 'auto', Intl.NumberFormat>();
export function formatNumber(value: number | null | undefined, decimals?: number): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (decimals !== undefined && (!Number.isInteger(decimals) || decimals < 0 || decimals > 8))
    throw Error('INVALID_DISPLAY_PRECISION');
  const key = decimals ?? 'auto';
  let formatter = formats.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat('fa-IR', {
      minimumFractionDigits: decimals ?? 0,
      maximumFractionDigits: decimals ?? 8,
    });
    formats.set(key, formatter);
  }
  return formatter.format(Object.is(value, -0) ? 0 : value);
}
