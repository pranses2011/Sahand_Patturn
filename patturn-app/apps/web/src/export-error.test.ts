import { describe, expect, it } from 'vitest';
import { zipErrorMessage, dxfErrorMessage } from './export-error';

describe('Persian ZIP failure messages', () => {
  it.each([
    ['BUNDLE_TOO_MANY_FILES', '۵۱۲'],
    ['BUNDLE_FILE_TOO_LARGE', '۶۴ MiB'],
    ['BUNDLE_TOTAL_TOO_LARGE', '۲۵۶ MiB'],
    ['BUNDLE_PATH_CONFLICT:notes.txt', 'پوشه'],
    ['BUNDLE_DUPLICATE_PATH:file.txt', 'نام یکسان'],
    ['BUNDLE_UNSAFE_PATH:../file.txt', 'استخراج امن'],
    ['EXPORT_CANCELLED', 'لغو شد'],
  ])('explains %s consistently for returned strings and thrown errors', (code, expected) => {
    expect(zipErrorMessage(code)).toContain(expected);
    expect(zipErrorMessage(new Error(code))).toBe(zipErrorMessage(code));
    expect(zipErrorMessage(`Error: ${code}`)).toBe(zipErrorMessage(code));
  });
  it('preserves unknown diagnostics instead of disguising a programming error', () => {
    expect(zipErrorMessage('ZIP_FAILED:worker unavailable')).toBe('ZIP_FAILED:worker unavailable');
    expect(zipErrorMessage(new Error('unexpected'))).toBe('unexpected');
    expect(zipErrorMessage('myfile-BUNDLE_TOTAL_TOO_LARGE.txt')).toBe(
      'myfile-BUNDLE_TOTAL_TOO_LARGE.txt',
    );
  });
});

describe('Persian DXF diagnostics', () => {
  it.each([
    ['DXF_PATH_LIMIT', 'چند فایل'],
    ['DXF_PATH_CHARACTER_LIMIT', 'طولانی'],
    ['DXF_VERTEX_LIMIT', 'جزئیات'],
    ['DXF_BEZIER_COMPLEXITY_LIMIT', 'جزئیات'],
    ['DXF_ARC_COMPLEXITY_LIMIT', 'جزئیات'],
    ['DXF_ARC_REQUIRES_EXPLICIT_TOLERANCE', 'تلرانس'],
    ['DXF_CUBIC_REQUIRES_EXPLICIT_TOLERANCE', 'تلرانس'],
    ['DXF_QUADRATIC_REQUIRES_EXPLICIT_TOLERANCE', 'تلرانس'],
    ['DXF_BEZIER_TOLERANCE_NOT_REACHED', 'دقت'],
    ['DXF_INVALID_BEZIER_TOLERANCE', 'تنظیمات'],
    ['DXF_INVALID_BEZIER_OPTIONS_OR_COORDINATES', 'تنظیمات'],
    ['DXF_INVALID_ARC_OPTIONS', 'تنظیمات'],
    ['DXF_ARC_COORDINATE_LIMIT', 'محدودهٔ امن'],
    ['DXF_ARC_RADIUS_LIMIT', 'محدودهٔ امن'],
    ['DXF_ARC_NUMERIC_LIMIT', 'محدودهٔ امن'],
    ['DXF_INVALID_BOUNDS', 'عرض و ارتفاع'],
    ['DXF_EMPTY_DRAWING', 'قابل‌ترسیم'],
    ['DXF_EMPTY_PATH', 'قابل‌ترسیم'],
    ['DXF_DEGENERATE_SUBPATH', 'قابل‌ترسیم'],
    ['DXF_INVALID_ARC_FLAG', 'صفر یا یک'],
    ['DXF_INVALID_SEPARATOR', 'ویرگول'],
    ['DXF_INVALID_CLOSE', 'آغاز'],
    ['DXF_MISSING_MOVE', 'آغاز'],
    ['DXF_INVALID_NUMBER', 'آرگومان'],
    ['DXF_INVALID_PATH', 'آرگومان'],
    ['DXF_UNSUPPORTED_COMMAND', 'پشتیبانی'],
  ])('explains %s for direct DXF and ZIP exports', (code, expected) => {
    const message = dxfErrorMessage(code);
    expect(message).toContain(expected);
    expect(message).not.toContain('DXF_');
    expect(dxfErrorMessage(new Error(code))).toBe(message);
    expect(dxfErrorMessage(`Error: ${code}:details`)).toBe(message);
    expect(zipErrorMessage(code)).toBe(message);
  });
  it('does not disguise unknown or embedded codes', () => {
    expect(dxfErrorMessage('DXF_NEW_FAILURE:details')).toBe('DXF_NEW_FAILURE:details');
    expect(dxfErrorMessage('file-DXF_PATH_LIMIT.svg')).toBe('file-DXF_PATH_LIMIT.svg');
  });
});
