import { beforeEach, expect, it, vi } from 'vitest';
import type { ExportResult } from '@patturn/exporters';
const mocks = vi.hoisted(() => ({
  pdf: vi.fn<(...args: unknown[]) => Promise<ExportResult>>(),
  zip: vi.fn(),
}));
vi.mock('@patturn/exporters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@patturn/exporters')>()),
  toOrthogonalCutterPdf: mocks.pdf,
  toBuildZip: mocks.zip,
}));
import { toOrthogonalCutterBundle } from './orthogonal-cutter-bundle';
import { writeOrthogonalCutterFile } from './orthogonal-cutter-file';
const file = () =>
  writeOrthogonalCutterFile({
    format: 'patturn-orthogonal-cutter',
    version: 1,
    units: 'mm',
    heightMm: 20,
    wallMm: 1.6,
    tipMm: 0.6,
    points: [
      [0, 0],
      [80, 0],
      [80, 30],
      [30, 30],
      [30, 80],
      [0, 80],
    ],
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.zip.mockResolvedValue({ ok: true, filename: 'test.zip', bytes: new Uint8Array([1]) });
});
it('does not request PDF when the option is off', async () => {
  expect((await toOrthogonalCutterBundle(file(), 'guide')).ok).toBe(true);
  expect(mocks.pdf).not.toHaveBeenCalled();
  expect(mocks.zip).toHaveBeenCalledOnce();
});
it.each(['returned failure', 'missing bytes', 'rejected import'])(
  'does not build a partial archive on PDF %s',
  async (mode) => {
    if (mode === 'rejected import') mocks.pdf.mockRejectedValue(Error('chunk unavailable'));
    else
      mocks.pdf.mockResolvedValue(
        mode === 'missing bytes'
          ? { ok: true, filename: 'missing.pdf' }
          : { ok: false, filename: '', error: 'PDF_FAILED' },
      );
    const result = await toOrthogonalCutterBundle(file(), 'guide', undefined, { includePdf: true });
    expect(result.ok).toBe(false);
    expect(result.bytes).toBeUndefined();
    expect(mocks.zip).not.toHaveBeenCalled();
  },
);
it('rechecks abort after a late successful PDF rather than compressing stale bytes', async () => {
  const controller = new AbortController();
  let complete!: (result: ExportResult) => void;
  mocks.pdf.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const pending = toOrthogonalCutterBundle(file(), 'guide', controller.signal, {
    includePdf: true,
  });
  controller.abort();
  complete({ ok: true, filename: 'test.pdf', bytes: new Uint8Array([1]) });
  const result = await pending;
  expect(result.error).toContain('EXPORT_CANCELLED');
  expect(result.bytes).toBeUndefined();
  expect(mocks.zip).not.toHaveBeenCalled();
});
