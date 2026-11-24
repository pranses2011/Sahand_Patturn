import { writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page, type TestInfo } from '@playwright/test';

/** Attach incomplete checks too: zero automated violations is not AA certification. */
async function audit(page: Page, info: TestInfo, state: string) {
  const report = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const reportPath = info.outputPath(`accessibility-${state}.json`);
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        state,
        engine: report.testEngine,
        environment: report.testEnvironment,
        tags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
        passedRules: report.passes.length,
        inapplicableRules: report.inapplicable.length,
        violations: report.violations,
        incomplete: report.incomplete,
        limitation:
          'Automated Chromium scan only; not manual keyboard/screen-reader or physical contrast certification.',
      },
      null,
      2,
    ),
  );
  await info.attach(`accessibility-${state}.json`, {
    contentType: 'application/json',
    path: reportPath,
  });
  expect(
    report.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      nodes: nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    })),
    state,
  ).toEqual([]);
}

test('WCAG automated scan covers four editor sections and all eleven expanded tools', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByRole('radio', { name: 'حرفه‌ای', exact: true }).check();
  await audit(page, info, 'form-pro');
  await page.locator('.btn.primary').hover();
  await audit(page, info, 'primary-hover');
  for (const [name, state] of [
    ['🔷 الگو', 'pattern-pro'],
    ['🧱 قالب', 'mold-pro'],
    ['📤 خروجی', 'export-pro'],
  ]) {
    await page.getByRole('button', { name, exact: true }).click();
    await audit(page, info, state!);
  }
  for (const selector of [
    '.chuck-tool',
    '.rounder-tool',
    '.cookie-cutter-tool',
    '.horizontal-split-tool',
    '.jigsaw-tool',
    '.slab-tool',
    '.rib-tool',
    '.extruder-tool',
    '.loft-sweep-tool',
    '.image-trace-tool',
    '.foot-ring-tool',
  ]) {
    const panel = page.locator(selector);
    await panel.locator('summary').click();
    await expect(panel.locator('input').first()).toBeVisible();
    await audit(page, info, selector.slice(1));
  }
});

test('WCAG automated scan covers simple controls, open auxiliary panels and narrow layout', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await audit(page, info, 'form-simple');
  for (const selector of [
    '.local-profile',
    '.privacy-notice',
    '.feature-requests',
    '.update-panel',
  ]) {
    await page.locator(selector).locator('summary').click();
  }
  await audit(page, info, 'auxiliary-panels');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.locator('.saved-patterns > summary').click();
  await audit(page, info, 'saved-patterns');
  await page.setViewportSize({ width: 390, height: 844 });
  await audit(page, info, 'narrow-pattern');
});

test('320px reflow keeps all four editor sections operable without horizontal page scrolling', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  const fits = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => window.innerWidth + 1),
    );
  };
  await fits();
  for (const name of ['🔷 الگو', '🧱 قالب', '📤 خروجی', '🏺 فرم']) {
    await page.getByRole('button', { name, exact: true }).click();
    await fits();
  }
  await audit(page, info, 'reflow-320-form');
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('6');
  await wall.press('Enter');
  await expect(wall).toHaveValue('6');
  const viewport = await page.locator('section.viewport').boundingBox();
  expect(viewport!.width).toBeLessThanOrEqual(320);
  expect(viewport!.height).toBeGreaterThanOrEqual(300);
  const panels = page.locator('.main > aside');
  const first = await panels.first().boundingBox(),
    last = await panels.last().boundingBox();
  expect(viewport!.y).toBeGreaterThanOrEqual(first!.y + first!.height - 1);
  expect(last!.y).toBeGreaterThanOrEqual(viewport!.y + viewport!.height - 1);
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('ریب‌ساز — الگوی دوبعدی پروفیل داخلی', { exact: true }).click();
  await fits();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'دانلود SVG ریب', exact: true }).click();
  expect((await pending).suggestedFilename()).toBe('rib_sampled-profile_back20mm.svg');
  await page.evaluate(() => {
    document.documentElement.dir = 'ltr';
  });
  await fits();
  for (const width of [640, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await fits();
    const top = await panels.first().boundingBox();
    const view = await page.locator('section.viewport').boundingBox();
    expect(view!.y).toBeGreaterThanOrEqual(top!.y + top!.height - 1);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const wideLeft = await panels.first().boundingBox(),
    wideViewport = await page.locator('section.viewport').boundingBox();
  expect(Math.abs(wideLeft!.y - wideViewport!.y)).toBeLessThan(2);
  expect(wideViewport!.width).toBeGreaterThan(400);
});

test('narrow reflow preserves keyboard navigation order and reveals the focused control', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await page.getByRole('button', { name: '🏺 فرم', exact: true }).focus();
  for (const name of ['🔷 الگو', '🧱 قالب', '📤 خروجی']) {
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name, exact: true })).toBeFocused();
  }
  await page.keyboard.press('Enter');
  const summary = page.locator('.rib-tool > summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  const number = page.getByRole('spinbutton', { name: 'عرض پشت ریب', exact: true });
  await expect(number).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(number).toBeFocused();
  const bounds = await number.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720);
  await number.fill('30');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('slider', { name: 'عرض پشت ریب', exact: true })).toBeFocused();
  await expect(number).toHaveValue('30');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('named project manager remains accessible through opened, dirty and conflicting states at 320px', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await page.getByText('مدیریت پروژه‌ها — ذخیره با نام و بازکردن', { exact: true }).click();
  const manager = page.locator('.project-manager');
  await expect(manager.getByRole('textbox', { name: 'نام پروژهٔ جدید', exact: true })).toBeVisible();
  await audit(page, info, 'projects-empty-320');
  const name = 'پروژهٔ آزمایشی با نام بلند برای بررسی دسترس‌پذیری و شکست خطوط '.repeat(3).trim();
  await manager.getByRole('textbox', { name: 'نام پروژهٔ جدید', exact: true }).fill(name);
  await manager.getByRole('button', { name: 'ذخیرهٔ وضعیت فعلی با نام', exact: true }).click();
  const open = manager.getByRole('button', { name: `بازکردن ${name}`, exact: true });
  await expect(open).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
  await audit(page, info, 'projects-saved-long-name-320');
  page.once('dialog', (dialog) => dialog.accept());
  await open.focus();
  await page.keyboard.press('Enter');
  const toggle = manager.getByRole('checkbox', {
    name: 'ذخیرهٔ خودکار پروژهٔ بازشده پس از ۲ ثانیه مکث',
    exact: true,
  });
  await expect(toggle).not.toBeChecked();
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toBeChecked();
  await page.keyboard.press('Space');
  await expect(toggle).not.toBeChecked();
  await audit(page, info, 'projects-opened-320');
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('6');
  await wall.press('Enter');
  await expect(
    manager.getByRole('status').filter({ hasText: 'هنوز ذخیره نشده‌اند' }),
  ).toBeVisible();
  await audit(page, info, 'projects-dirty-320');
  await page.evaluate(() => {
    const records = JSON.parse(localStorage.getItem('patturn:projects')!);
    records[0].updatedAt = '2099-01-01T00:00:00.000Z';
    records[0].data.updatedAt = records[0].updatedAt;
    localStorage.setItem('patturn:projects', JSON.stringify(records));
  });
  page.once('dialog', (dialog) => dialog.accept());
  await manager.getByRole('button', { name: 'ذخیرهٔ تغییرات در پروژهٔ بازشده', exact: true }).click();
  await expect(manager.getByRole('alert')).toContainText('تعارض ذخیره');
  await audit(page, info, 'projects-conflict-320');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
  const disconnect = manager.getByRole('button', {
    name: 'پایان ارتباط با پروژهٔ نام‌دار',
    exact: true,
  });
  await disconnect.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveCount(0);
  await expect(manager.getByRole('textbox', { name: 'نام پروژهٔ جدید', exact: true })).toBeFocused();
  await expect(wall).toHaveValue('6');
});

test('convex SVG cutter preview and rejected import remain accessible at 320px', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  const panel = page.locator('.cookie-cutter-tool');
  await panel.locator('summary').click();
  const input = panel.getByLabel('ورود SVG تک‌چندضلعی محدب', { exact: true });
  const source =
    '<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="40mm" viewBox="0 0 40 40"><polygon points="0,0 40,0 40,40 0,40"/></svg>';
  await input.setInputFiles({
    name: 'square.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(source),
  });
  await expect(
    panel.getByRole('button', { name: 'دانلود STL کاتر چندضلعی', exact: true }),
  ).toBeEnabled();
  await audit(page, info, 'convex-cutter-svg-320');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
  await input.setInputFiles({
    name: 'invalid.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(source.replace('40mm', '40px')),
  });
  await expect(panel.getByRole('alert')).toContainText('SVG پشتیبانی نشد');
  await audit(page, info, 'convex-cutter-svg-rejected-320');
  await panel.getByRole('button', { name: 'بازگشت به کاتر گرد', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(
    panel.getByRole('button', { name: 'دانلود STL کاتر گرد', exact: true }),
  ).toBeEnabled();
});

test('manual cutter sketch is keyboard operable and reflows at 320px', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  const panel = page.locator('.cookie-cutter-tool');
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: 'رسم چندضلعی محدب با نقاط', exact: true }).click();
  await audit(page, info, 'manual-cutter-open-320');
  const canvas = panel.getByRole('img', {
    name: 'صفحهٔ رسم نقطه‌ای کاتر با نشانگر صفحه‌کلید',
    exact: true,
  });
  await canvas.focus();
  await page.keyboard.press('Enter');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Enter');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Enter');
  // Vertex controls now precede the close button in the tab order.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    if (
      await panel
        .getByRole('button', { name: 'بستن و بررسی طرح کاتر', exact: true })
        .evaluate((el) => el === document.activeElement)
    )
      break;
  }
  await expect(
    panel.getByRole('button', { name: 'بستن و بررسی طرح کاتر', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    panel.getByRole('button', { name: 'دانلود STL کاتر چندضلعی', exact: true }),
  ).toBeEnabled();
  await audit(page, info, 'manual-cutter-closed-320');
  const vertexX = panel.getByRole('spinbutton', { name: 'مختصات افقی رأس کاتر (mm)', exact: true });
  await vertexX.fill('151');
  await panel.getByRole('button', { name: 'اعمال مختصات رأس کاتر', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('هر دو مختصات');
  await expect(
    panel.getByRole('button', { name: 'بستن و بررسی طرح کاتر', exact: true }),
  ).toBeDisabled();
  await audit(page, info, 'manual-cutter-invalid-vertex-320');

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});
