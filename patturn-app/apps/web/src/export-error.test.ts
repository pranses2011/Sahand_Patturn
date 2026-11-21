import { describe, expect, it } from 'vitest';
import { zipErrorMessage } from './export-error';

describe('Persian ZIP failure messages', () => {
  it.each([
    ['BUNDLE_TOO_MANY_FILES', '512'],
    ['BUNDLE_FILE_TOO_LARGE', '64 MiB'],
    ['BUNDLE_TOTAL_TOO_LARGE', '256 MiB'],
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
