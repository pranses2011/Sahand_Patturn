import { localOnlyPolicy, writeLocalOnlyAudit } from './local-only-policy';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, gunzipSync, strFromU8 } from 'fflate';
import DxfParser from 'dxf-parser';

test.use({ serviceWorkers: 'block' });

test('form to mold to ZIP uses local assets only and exports coherent manufacturing files', async ({
  page,
  baseURL,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const audit = await localOnlyPolicy(context, baseURL!);
  await page.goto('/');
  await page.getByRole('radio', { name: 'حرفه‌ای', exact: true }).check();
  const segments = page.locator('.ctl').filter({ hasText: 'تعداد سگمنت' }).locator('input.num');
  await segments.fill('24');
  await segments.press('Tab');
  await page.getByText('🔷 الگو', { exact: true }).click();
  await page.getByRole('radio', { name: 'موج', exact: true }).check();
  await page.getByText('🧱 قالب', { exact: true }).click();
  await expect(
    page.getByText('✅ قالب سه‌بعدی ساخته شد — در viewport ببینید', { exact: false }),
  ).toBeVisible({ timeout: 90_000 });
  await page.getByText('📤 خروجی', { exact: true }).click();
  await page.getByRole('button', { name: 'ساخت محفظه برای قطعات گچی', exact: true }).click();
  const boxHalves = page.getByRole('button', { name: /^⬇ نیمهٔ [۱۲12] محفظه$/ });
  await expect(boxHalves).toHaveCount(4, { timeout: 90_000 });
  // Switching related tabs must not rebuild the mold and discard derived mother boxes.
  await page.getByText('🧱 قالب', { exact: true }).click();
  await page.getByText('📤 خروجی', { exact: true }).click();
  await expect(boxHalves).toHaveCount(4);
  await page.getByText('🏺 فرم', { exact: true }).click();
  await page.getByText('🔷 الگو', { exact: true }).click();
  await page.getByRole('radio', { name: 'لوزی', exact: true }).check();
  await page.getByRole('radio', { name: 'موج', exact: true }).check();
  await page.getByText('📤 خروجی', { exact: true }).click();
  await expect(boxHalves).toHaveCount(4);
  const zipButton = page.getByRole('button', {
    name: '⬇ ZIP ساخت: قطعات، مواد و راهنما',
    exact: true,
  });
  await expect(zipButton).toBeEnabled({ timeout: 90_000 });
  const downloaded = page.waitForEvent('download', { timeout: 90_000 });
  await zipButton.click();
  const zip = await downloaded;
  expect(zip.suggestedFilename()).toMatch(/\.zip$/);
  const files = unzipSync(new Uint8Array(await readFile((await zip.path())!)));
  const names = Object.keys(files);
  expect(names).toEqual(
    expect.arrayContaining(['README.txt', 'manifest.json', 'parameters.json', 'BOM.txt']),
  );
  const manifest = JSON.parse(strFromU8(files['manifest.json']!));
  expect(manifest.units).toBe('mm');
  expect(manifest.stlValidated).toBe(true);
  expect(manifest.objValidated).toBe(true);
  for (const item of manifest.files) expect(files[item.path]?.length, item.path).toBe(item.bytes);
  const params = JSON.parse(strFromU8(files['parameters.json']!));
  expect(params.segments).toBe(24);
  expect(params.pattern.id).toBe('wave');
  expect(params.motherBoxPartsIncluded).toBe(2);
  expect(names.filter((n) => n.startsWith('mother-box/') && n.endsWith('.stl'))).toHaveLength(4);
  expect(params.pattern.dxf).toMatchObject({ clippedToCanvas: true, bezierToleranceMm: 0.05 });
  const stls = names.filter((n) => n.endsWith('.stl'));
  expect(stls.some((n) => n.startsWith('parts/'))).toBe(true);
  for (const name of stls) {
    const bytes = files[name]!,
      view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const triangles = view.getUint32(80, true);
    expect(triangles).toBeGreaterThan(0);
    expect(bytes.length).toBe(84 + 50 * triangles);
  }
  const project = names.find((n) => n.endsWith('.patturn'))!;
  expect(JSON.parse(strFromU8(gunzipSync(files[project]!))).state).toMatchObject({
    segments: 24,
    patternId: 'wave',
  });
  const pdf = names.find((n) => n.endsWith('.pdf'))!;
  expect(strFromU8(files[pdf]!.slice(0, 5))).toBe('%PDF-');
  const svg = names.find((n) => n.endsWith('.svg'))!;
  expect(strFromU8(files[svg]!)).toContain('width="300mm"');
  const dxf = names.find((n) => n.endsWith('.dxf'))!;
  expect(new DxfParser().parseSync(strFromU8(files[dxf]!))!.entities.length).toBeGreaterThan(0);
  expect(strFromU8(files['README.txt']!)).toContain('۰٫۰۵mm');
  // Real geometry changes must invalidate both the mold snapshot and its mother boxes.
  await page.getByText('🏺 فرم', { exact: true }).click();
  await segments.fill('28');
  await segments.press('Tab');
  await page.getByText('📤 خروجی', { exact: true }).click();
  await expect(zipButton).toBeEnabled({ timeout: 90_000 });
  await expect(boxHalves).toHaveCount(0);
  const changedDownload = page.waitForEvent('download', { timeout: 90_000 });
  await zipButton.click();
  const changedZip = await changedDownload;
  const changedFiles = unzipSync(new Uint8Array(await readFile((await changedZip.path())!)));
  const changedParams = JSON.parse(strFromU8(changedFiles['parameters.json']!));
  expect(changedParams.segments).toBe(28);
  expect(changedParams.motherBoxPartsIncluded).toBe(0);
  expect(Object.keys(changedFiles).filter((n) => n.startsWith('mother-box/'))).toHaveLength(0);
  await writeLocalOnlyAudit(testInfo, 'pipeline', audit);
  expect(audit.blocked).toEqual([]);
});

test('failed WASM load does not invalidate the form and explicit mold retry recovers', async ({
  page,
}) => {
  let aborted = false,
    allowWasm = false;
  await page.route('**/*.wasm', async (route) => {
    if (!allowWasm) {
      aborted = true;
      await route.abort('failed');
    } else await route.continue();
  });
  await page.goto('/');
  await page.getByText('🧱 قالب', { exact: true }).click();
  const error = page.getByRole('alert').filter({ hasText: 'ساخت قالب ناموفق بود' });
  await expect(error).toBeVisible();
  expect(aborted).toBe(true);
  await expect(page.locator('footer')).not.toContainText('⚠');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '⬇ خروجی STL فرم', exact: true }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.stl$/);
  allowWasm = true;
  await page.getByRole('button', { name: 'تلاش دوبارهٔ ساخت قالب', exact: true }).click();
  await expect(
    page.getByText('✅ قالب سه‌بعدی ساخته شد — در viewport ببینید', { exact: false }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(error).toHaveCount(0);
});

test('changing capacity inputs while PDF loads cancels stale ZIP and a retry exports current parameters', async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const requestedPdf = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route('**/assets/jspdf.es.min-*.js', async (route) => {
    requested();
    await held;
    await route.continue();
  });
  const downloads: string[] = [];
  page.on('download', (file) => downloads.push(file.suggestedFilename()));
  await page.goto('/');
  await page.getByRole('radio', { name: 'حرفه‌ای', exact: true }).check();
  const segments = page.getByRole('spinbutton', { name: 'تعداد سگمنت', exact: true });
  await segments.fill('24');
  await segments.press('Enter');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  const zip = page.getByRole('button', { name: '⬇ ZIP ساخت: قطعات، مواد و راهنما', exact: true });
  await expect(zip).toBeEnabled({ timeout: 90_000 });
  await zip.click();
  await requestedPdf;
  await page.getByRole('button', { name: '🏺 فرم', exact: true }).click();
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('6');
  await wall.press('Enter');
  release();
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'بسته‌بندی لغو شد؛ فایلی دانلود نشد.' }),
  ).toBeVisible();
  expect(downloads).toEqual([]);
  await expect(zip).toBeEnabled();
  const event = page.waitForEvent('download');
  await zip.click();
  const file = await event;
  const path = await file.path();
  expect(path).not.toBeNull();
  const entries = unzipSync(new Uint8Array(await readFile(path!)));
  expect(JSON.parse(strFromU8(entries['parameters.json']!)).wallMm).toBe(6);
  expect(downloads).toHaveLength(1);
});

test('standalone PDF supports explicit cancellation while loading and a subsequent retry', async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const requestedPdf = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route('**/assets/jspdf.es.min-*.js', async (route) => {
    requested();
    await held;
    await route.continue();
  });
  const downloads: string[] = [];
  page.on('download', (file) => downloads.push(file.suggestedFilename()));
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  const pdf = page.getByRole('button', { name: '⬇ PDF برگهٔ ابعاد A4 — مقیاس ۱:۱', exact: true });
  await pdf.click();
  await requestedPdf;
  await page.getByRole('button', { name: 'لغو آماده‌سازی PDF', exact: true }).click();
  release();
  await expect(
    page.getByRole('status').filter({ hasText: 'آماده‌سازی PDF لغو شد؛ فایلی دانلود نشد.' }),
  ).toBeVisible();
  expect(downloads).toEqual([]);
  await expect(pdf).toBeEnabled();
  const downloaded = page.waitForEvent('download');
  await pdf.click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(/\.pdf$/);
  const path = await file.path();
  expect(path).not.toBeNull();
  expect((await readFile(path!)).subarray(0, 5).toString()).toBe('%PDF-');
  expect(downloads).toHaveLength(1);
});

test('mold engine JavaScript and WASM stay deferred during form and pattern editing', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const engine: string[] = [],
    wasm: string[] = [];
  page.on('request', (request) => {
    if (/\/assets\/csg-[^/]+\.js(?:\?|$)/.test(request.url())) engine.push(request.url());
    if (request.url().includes('.wasm')) wasm.push(request.url());
  });
  await page.goto('/');
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('5');
  await wall.press('Enter');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByRole('radio', { name: 'موج', exact: true }).check();
  await expect(page.getByRole('radio', { name: 'موج', exact: true })).toBeChecked();
  expect(engine).toEqual([]);
  expect(wasm).toEqual([]);
  await page.getByRole('button', { name: '🧱 قالب', exact: true }).click();
  await expect(
    page.getByText('✅ قالب سه‌بعدی ساخته شد — در viewport ببینید', { exact: false }),
  ).toBeVisible({ timeout: 60_000 });
  expect(engine).toHaveLength(1);
  expect(wasm).toHaveLength(1);
  await page.getByRole('button', { name: '🏺 فرم', exact: true }).click();
  await page.getByRole('button', { name: '🧱 قالب', exact: true }).click();
  await expect(
    page.getByText('✅ قالب سه‌بعدی ساخته شد — در viewport ببینید', { exact: false }),
  ).toBeVisible();
  expect(engine).toHaveLength(1);
  expect(wasm).toHaveLength(1);
  await expect(wall).toHaveCount(0);
});
