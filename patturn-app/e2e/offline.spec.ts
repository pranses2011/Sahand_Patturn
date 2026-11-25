import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import DxfParser from 'dxf-parser';
import { localOnlyPolicy, writeLocalOnlyAudit } from './local-only-policy';

test.use({ serviceWorkers: 'block' });
async function download(page: Page, button: Locator) {
  const pending = page.waitForEvent('download');
  await button.click();
  const file = await pending;
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) };
}
function verifyStl(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    triangles = view.getUint32(80, true);
  expect(triangles).toBeGreaterThan(0);
  expect(bytes.byteLength).toBe(84 + 50 * triangles);
  let nonfinite = 0;
  for (let i = 0; i < triangles; i++)
    for (let coordinate = 0; coordinate < 12; coordinate++)
      if (!Number.isFinite(view.getFloat32(84 + i * 50 + coordinate * 4, true))) nonfinite++;
  expect(nonfinite).toBe(0);
}

test('local-only policy blocks external fetches, local writes and WebSockets', async ({
  page,
  context,
  baseURL,
}) => {
  const audit = await localOnlyPolicy(context, baseURL!);
  await page.goto('/');
  await page.evaluate(async () => {
    await Promise.allSettled([
      fetch('https://offline-probe.invalid/no-network'),
      fetch('/offline-write-probe', { method: 'POST', body: 'synthetic test' }),
    ]);
    await new Promise<void>((resolve) => {
      const socket = new WebSocket('wss://offline-probe.invalid/no-network');
      socket.onclose = () => resolve();
      socket.onerror = () => resolve();
    });
  });
  await expect.poll(() => audit.blocked.length).toBe(3);
  expect(audit.blocked.map((item) => item.method).sort()).toEqual(['GET', 'POST', 'WEBSOCKET']);
});

test('cold local-only cutter outputs and PDF ZIP agree with one restorable snapshot', async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.setTimeout(60_000);
  const audit = await localOnlyPolicy(context, baseURL!);
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  const get = (name: string) => download(page, panel.getByRole('button', { name, exact: true }));
  const stl = await get('دانلود STL کاتر قائم‌الزاویه'),
    svg = await get('دانلود SVG مرز کاتر قائم‌الزاویه'),
    dxf = await get('دانلود DXF مرز کاتر قائم‌الزاویه'),
    file = await get('ذخیرهٔ فایل مستقل کاتر قائم‌الزاویه');
  verifyStl(stl.bytes);
  expect(svg.bytes.toString()).toContain('width="80mm"');
  expect(new DxfParser().parseSync(dxf.bytes.toString())!.header['$INSUNITS']).toBe(4);
  expect(audit.localRequests.some((url) => /jspdf|vazirmatn/.test(url))).toBe(false);
  const pdf = await get('دانلود PDF مرز کاتر قائم‌الزاویه');
  expect(pdf.bytes.toString()).toContain('/FontFile2');
  expect(pdf.bytes.toString()).toContain('/MediaBox [0 0 595.28 841.89]');
  await panel
    .getByRole('checkbox', { name: 'افزودن PDF مقیاس واقعی به ZIP کاتر', exact: true })
    .check();
  const zip = await get('دانلود ZIP مستقل کاتر قائم‌الزاویه'),
    entries = unzipSync(zip.bytes);
  expect(Object.keys(entries)).toHaveLength(7);
  expect(Buffer.from(entries['boundaries/inner.svg']!)).toEqual(svg.bytes);
  expect(Buffer.from(entries['boundaries/inner.dxf']!)).toEqual(dxf.bytes);
  expect(Buffer.from(entries['boundaries/inner-A4-1to1.pdf']!)).toEqual(pdf.bytes);
  expect(Buffer.from(entries['cutter.orthogonal.json']!)).toEqual(file.bytes);
  // STL headers name their source differently; geometry/count payloads must still match.
  expect(Buffer.from(entries['parts/cutter.stl']!.slice(80))).toEqual(stl.bytes.subarray(80));
  const manifest = JSON.parse(strFromU8(entries['manifest.json']!));
  for (const item of manifest.files) expect(entries[item.path]!.length).toBe(item.bytes);
  await panel.getByLabel('بازکردن فایل مستقل کاتر قائم‌الزاویه', { exact: true }).setInputFiles({
    name: file.name,
    mimeType: 'application/json',
    buffer: Buffer.from(entries['cutter.orthogonal.json']!),
  });
  const restored = await get('دانلود STL کاتر قائم‌الزاویه');
  expect(restored.bytes).toEqual(stl.bytes);
  expect(audit.localRequests.some((url) => url.includes('orthogonal-cutter-bundle-'))).toBe(true);
  expect(audit.localRequests.some((url) => url.includes('vazirmatn'))).toBe(true);
  await writeLocalOnlyAudit(testInfo, 'cutter', audit);
  expect(audit.blocked).toEqual([]);
});

test('cold local-only rib exports load the bundled PDF engine and Persian font without a network service', async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.setTimeout(60_000);
  const audit = await localOnlyPolicy(context, baseURL!);
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  const panel = page.locator('.rib-tool');
  await panel.locator('summary').click();
  const get = (name: string) => download(page, panel.getByRole('button', { name, exact: true }));
  const stl = await get('دانلود STL ریب'),
    svg = await get('دانلود SVG ریب'),
    dxf = await get('دانلود DXF ریب');
  verifyStl(stl.bytes);
  expect(svg.bytes.toString()).toContain('mm"');
  expect(new DxfParser().parseSync(dxf.bytes.toString())!.entities.length).toBeGreaterThan(0);
  expect(audit.localRequests.some((url) => /jspdf|vazirmatn/.test(url))).toBe(false);
  const pdf = await get('دانلود PDF ریب');
  expect(pdf.bytes.toString()).toContain('/FontFile2');
  expect(pdf.bytes.toString()).toContain('/MediaBox [0 0 595.28 841.89]');
  expect(audit.localRequests.some((url) => url.includes('rib-pdf-'))).toBe(true);
  expect(audit.localRequests.some((url) => url.includes('vazirmatn'))).toBe(true);
  await writeLocalOnlyAudit(testInfo, 'rib', audit);
  expect(audit.blocked).toEqual([]);
});
