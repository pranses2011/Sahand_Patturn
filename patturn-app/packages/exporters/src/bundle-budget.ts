export const BUNDLE_LIMITS = Object.freeze({
  files: 512,
  fileBytes: 64 * 1024 * 1024,
  totalBytes: 256 * 1024 * 1024,
});

/** Counts uncompressed inputs, not peak JS/worker memory or compressed output size. */
export function createBundleBudget() {
  let files = 0,
    totalBytes = 0;
  return {
    add(bytes: number) {
      if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > BUNDLE_LIMITS.fileBytes)
        throw new Error('BUNDLE_FILE_TOO_LARGE');
      if (files + 1 > BUNDLE_LIMITS.files) throw new Error('BUNDLE_TOO_MANY_FILES');
      if (totalBytes + bytes > BUNDLE_LIMITS.totalBytes) throw new Error('BUNDLE_TOTAL_TOO_LARGE');
      files++;
      totalBytes += bytes;
    },
  };
}
