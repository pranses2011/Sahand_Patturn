import { describe, expect, it } from 'vitest';
import { BUNDLE_LIMITS as limits, createBundleBudget } from './bundle-budget';

describe('Uncompressed ZIP input budget', () => {
  it('accepts exact per-file and total boundaries and rejects one additional byte', () => {
    const budget = createBundleBudget();
    for (let n = 0; n < limits.totalBytes / limits.fileBytes; n++) budget.add(limits.fileBytes);
    expect(() => budget.add(1)).toThrow('BUNDLE_TOTAL_TOO_LARGE');
    expect(() => budget.add(0)).not.toThrow();
  });
  it('enforces file count even for empty payloads', () => {
    const budget = createBundleBudget();
    for (let n = 0; n < limits.files; n++) budget.add(0);
    expect(() => budget.add(0)).toThrow('BUNDLE_TOO_MANY_FILES');
  });
  it.each([-1, NaN, Infinity, 0.5, limits.fileBytes + 1])(
    'rejects invalid or excessive size %s without consuming budget',
    (bytes) => {
      const budget = createBundleBudget();
      expect(() => budget.add(bytes)).toThrow('BUNDLE_FILE_TOO_LARGE');
      expect(() => budget.add(limits.fileBytes)).not.toThrow();
    },
  );
});
