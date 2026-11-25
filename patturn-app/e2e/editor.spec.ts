import DxfParser from 'dxf-parser';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { gunzipSync, unzipSync, strFromU8 } from 'fflate';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('WebGL failure stays isolated; parameter edit, undo/redo and portable project round-trip work', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('alert').filter({ hasText: 'نمایش سه‌بعدی در دسترس نیست' }),
  ).toBeVisible();
  const wall = page
    .locator('.ctl')
    .filter({ hasText: 'ضخامت شعاعی برای ظرفیت' })
    .locator('input.num');
  await expect(wall).toHaveValue('4');
  await wall.fill('6');
  await wall.press('Tab');
  await expect(wall).toHaveValue('6');
  await page.getByRole('button', { name: /^واگرد/ }).click();
  await expect(wall).toHaveValue('4');
  await page.getByRole('button', { name: /^ازنو/ }).click();
  await expect(wall).toHaveValue('6');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ذخیرهٔ فایل پروژه', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/\.patturn$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  await wall.fill('8');
  await wall.press('Tab');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('انتخاب فایل پروژه', { exact: true }).setInputFiles(path!);
  await expect(wall).toHaveValue('6');
  await expect(page.getByRole('button', { name: 'خروجی SVG الگو', exact: true })).toBeEnabled();
});

test('flat pattern selection and SVG/DXF downloads work without WebGL', async ({ page }) => {
  await page.goto('/');
  await page.getByText('🔷 الگو', { exact: true }).click();
  await page.getByRole('radio', { name: 'موج', exact: true }).check();
  await expect(
    page.getByRole('img', { name: 'پیش‌نمایش تخت الگو روی بوم ۳۰۰ در ۳۰۰ میلی‌متر' }),
  ).toBeVisible();
  await expect(page.locator('.viewport canvas')).toHaveCount(0);
  const svgEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'خروجی SVG الگو', exact: true }).click();
  const svg = await svgEvent;
  expect(await readFile((await svg.path())!, 'utf8')).toContain('stroke-width="1.5"');
  await page.getByText('📤 خروجی', { exact: true }).click();
  const dxfEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: /DXF الگو/ }).click();
  const dxf = await dxfEvent;
  const text = await readFile((await dxf.path())!, 'utf8');
  expect(text).toContain('tolerance 0.05 mm');
  expect(text).toContain('\nLINE\n');
  await expect(
    page.getByRole('status').filter({ hasText: 'درخواست دانلود به مرورگر ارسال شد' }),
  ).toBeVisible();
});

test('numeric draft supports clearing, decimal typing, escape and committed undo', async ({
  page,
}) => {
  await page.goto('/');
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('');
  await expect(wall).toHaveValue('');
  await expect(page.locator('footer')).toContainText('ضخامت ۴ mm');
  await wall.press('Tab');
  await expect(wall).toHaveValue('4');
  await wall.fill('12');
  await wall.press('Escape');
  await expect(wall).toHaveValue('4');
  const shrink = page.getByRole('spinbutton', { name: 'شیرینک', exact: true });
  await shrink.fill('');
  await shrink.pressSequentially('12.5');
  await expect(page.locator('footer')).toContainText('انقباض ۱۲٪');
  await shrink.press('Enter');
  await expect(page.locator('footer')).toContainText('انقباض ۱۲٫۵٪');
  await page.getByRole('button', { name: /^واگرد/ }).click();
  await expect(shrink).toHaveValue('12');
});

test('section navigation works with Tab, Enter and Space and reports the current section', async ({
  page,
}) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'بخش‌های طراحی', exact: true });
  const form = nav.getByRole('button', { name: '🏺 فرم', exact: true });
  await expect(form).toHaveAttribute('aria-current', 'page');
  await form.focus();
  await page.keyboard.press('Tab');
  const pattern = nav.getByRole('button', { name: '🔷 الگو', exact: true });
  await expect(pattern).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(pattern).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('img', { name: 'پیش‌نمایش تخت الگو روی بوم ۳۰۰ در ۳۰۰ میلی‌متر' }),
  ).toBeVisible();
  await page.keyboard.press('Tab');
  const mold = nav.getByRole('button', { name: '🧱 قالب', exact: true });
  await expect(mold).toBeFocused();
  await page.keyboard.press('Space');
  await expect(mold).toHaveAttribute('aria-current', 'page');
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
});

test('autosave quota failure preserves previous history and retry persists across reload', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const key = 'patturn:editor-history:v1';
    if (localStorage.getItem(key) === null)
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          entries: [
            {
              id: 'initial',
              savedAt: '2026-11-20T00:00:00.000Z',
              state: {
                profileMode: 'reference',
                segments: 96,
                wall: 4,
                shrink: 12,
                fill: 80,
                patternId: 'dot-grid',
                tileSize: 40,
              },
            },
          ],
        }),
      );
    (window as unknown as { testDenyHistoryWrites: boolean }).testDenyHistoryWrites = true;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (
        name === key &&
        (window as unknown as { testDenyHistoryWrites: boolean }).testDenyHistoryWrites
      )
        throw new DOMException('Synthetic quota limit', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  });
  await page.goto('/');
  const previous = await page.evaluate(() => localStorage.getItem('patturn:editor-history:v1'));
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('6');
  await wall.press('Enter');
  const error = page.getByRole('alert').filter({ hasText: /^ذخیرهٔ محلی ناموفق بود/ });
  await expect(error).toBeVisible({ timeout: 10_000 });
  expect(await page.evaluate(() => localStorage.getItem('patturn:editor-history:v1'))).toBe(
    previous,
  );
  await expect(page.locator('header')).not.toContainText('✓ ذخیره شد');
  await page.evaluate(() => {
    (window as unknown as { testDenyHistoryWrites: boolean }).testDenyHistoryWrites = false;
  });
  await error.getByRole('button', { name: 'تلاش دوباره', exact: true }).click();
  await expect(error).toHaveCount(0);
  await expect(page.locator('header')).toContainText('✓ ذخیره شد');
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('patturn:editor-history:v1')!),
  );
  expect(saved.entries[0].state.wall).toBe(6);
  expect(saved.entries[1].state.wall).toBe(4);
  await page.reload();
  await expect(wall).toHaveValue('6');
});

test('corrupted autosave is not silently overwritten and portable export remains available', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('patturn:editor-history:v1', '{broken');
  });
  await page.goto('/');
  await expect(
    page.getByRole('alert').filter({ hasText: 'بازیابی ذخیرهٔ محلی ناموفق بود' }),
  ).toBeVisible();
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('7');
  await wall.press('Enter');
  const error = page.getByRole('alert').filter({ hasText: /^ذخیرهٔ محلی ناموفق بود/ });
  await expect(error).toBeVisible({ timeout: 10_000 });
  await error.getByRole('button', { name: 'تلاش دوباره', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('patturn:editor-history:v1'))).toBe(
    '{broken',
  );
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ذخیرهٔ فایل پروژه', exact: true }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.patturn$/);
  await expect(wall).toHaveValue('7');
});

test('keyboard focus is visible and numeric units are available as accessible descriptions', async ({
  page,
}) => {
  await page.goto('/');
  const form = page
    .getByRole('navigation', { name: 'بخش‌های طراحی' })
    .getByRole('button', { name: '🏺 فرم', exact: true });
  await form.focus();
  await page.keyboard.press('Tab');
  const pattern = page
    .getByRole('navigation', { name: 'بخش‌های طراحی' })
    .getByRole('button', { name: '🔷 الگو', exact: true });
  await expect(pattern).toBeFocused();
  await expect(pattern).toHaveCSS('outline-style', 'solid');
  await expect(pattern).toHaveCSS('outline-width', '3px');
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.focus();
  await expect(wall).toHaveCSS('outline-width', '3px');
  await expect(wall).toHaveAccessibleDescription('mm');
  const slider = page.getByRole('slider', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await page.keyboard.press('Tab');
  await expect(slider).toBeFocused();
  await expect(slider).toHaveCSS('outline-width', '3px');
  await expect(slider).toHaveAccessibleDescription('mm');
  await expect(
    page.getByRole('spinbutton', { name: 'شیرینک', exact: true }),
  ).toHaveAccessibleDescription('٪');
});

test('invalid or oversized project imports preserve edits; cancelling replacement permits a later valid import', async ({
  page,
}) => {
  await page.goto('/');
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('6');
  await wall.press('Enter');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ذخیرهٔ فایل پروژه', exact: true }).click();
  const validPath = await (await downloaded).path();
  expect(validPath).not.toBeNull();
  await wall.fill('8');
  await wall.press('Enter');
  const input = page.getByLabel('انتخاب فایل پروژه', { exact: true });
  let dialogs = 0;
  const dismiss = (dialog: import('@playwright/test').Dialog) => {
    dialogs++;
    void dialog.dismiss();
  };
  page.on('dialog', dismiss);
  const error = page
    .getByRole('alert')
    .filter({ hasText: 'فایل پروژه باز نشد؛ تنظیمات فعلی تغییر نکرد' });
  await input.setInputFiles({
    name: 'broken.patturn',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('not gzip'),
  });
  await expect(error).toBeVisible();
  await expect(wall).toHaveValue('8');
  expect(dialogs).toBe(0);
  await input.setInputFiles({
    name: 'oversized.patturn',
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(256 * 1024 + 1),
  });
  await expect(error).toContainText('PROJECT_FILE_TOO_LARGE');
  await expect(wall).toHaveValue('8');
  expect(dialogs).toBe(0);
  await input.setInputFiles(validPath!);
  await expect.poll(() => dialogs).toBe(1);
  await expect(wall).toHaveValue('8');
  await expect(error).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'بازکردن پروژه', exact: true })).toBeEnabled();
  page.off('dialog', dismiss);
  page.once('dialog', (dialog) => dialog.accept());
  await input.setInputFiles(validPath!);
  await expect(wall).toHaveValue('6');
  await expect(error).toHaveCount(0);
});

test('pattern search filters locally without changing the selected project pattern', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  const library = page.getByRole('group', { name: 'الگوهای آماده', exact: true });
  const search = library.getByRole('searchbox', { name: 'جست‌وجوی الگو' });
  await expect(library.getByRole('radio')).toHaveCount(12);
  await search.fill('كوميكو');
  await expect(library.getByRole('radio')).toHaveCount(1);
  await library.getByRole('radio').check();
  await search.fill('not-found');
  await expect(library.getByRole('radio')).toHaveCount(0);
  await expect(library.getByRole('status')).toContainText('۰ الگو از ۱۲');
  await library.getByRole('button', { name: 'پاک‌کردن جست‌وجو', exact: true }).click();
  await expect(library.getByRole('radio')).toHaveCount(12);
  await expect(library.getByRole('radio', { name: 'الهام از کومیکو', exact: true })).toBeChecked();
  await expect(page.getByRole('spinbutton', { name: 'اندازهٔ کاشی', exact: true })).toHaveValue(
    '40',
  );
});

test('named pattern recipes reject duplicate names without overwriting and apply after reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  const name = page.getByRole('textbox', { name: 'نام تنظیمات', exact: true });
  const tile = page.getByRole('spinbutton', { name: 'اندازهٔ کاشی', exact: true });
  await name.fill('نمونهٔ من');
  await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات فعلی', exact: true }).click();
  await expect(name).toHaveValue('');
  const before = await page.evaluate(() => localStorage.getItem('patturn:pattern-library:v1'));
  await tile.fill('60');
  await tile.press('Enter');
  await name.fill('  نمونهٔ من  ');
  await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات فعلی', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'این نام قبلاً ذخیره شده است' }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('patturn:pattern-library:v1'))).toBe(
    before,
  );
  await expect(name).toHaveValue('  نمونهٔ من  ');
  await page.reload();
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  await tile.fill('60');
  await tile.press('Enter');
  await page.getByRole('button', { name: 'اعمال نمونهٔ من', exact: true }).click();
  await expect(tile).toHaveValue('40');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'حذف نمونهٔ من', exact: true }).click();
  await expect(page.getByRole('button', { name: 'اعمال نمونهٔ من', exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'حذف نمونهٔ من', exact: true }).click();
  await expect(page.getByRole('button', { name: 'اعمال نمونهٔ من', exact: true })).toHaveCount(0);
});

test('control mode persists independently of project history', async ({ page }) => {
  await page.goto('/');
  const simple = page.getByRole('radio', { name: 'ساده', exact: true });
  const pro = page.getByRole('radio', { name: 'حرفه‌ای', exact: true });
  await expect(simple).toBeChecked();
  await pro.check();
  await page.reload();
  await expect(pro).toBeChecked();
  await expect(page.getByRole('spinbutton', { name: 'تعداد سگمنت', exact: true })).toHaveValue(
    '96',
  );
  await simple.check();
  await page.reload();
  await expect(simple).toBeChecked();
  await expect(
    page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true }),
  ).toHaveValue('4');
});

test('named recipe lists synchronize across browser tabs without changing either project', async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  for (const tab of [page, other]) {
    await tab.goto('/');
    await tab.getByRole('button', { name: '🔷 الگو', exact: true }).click();
    await tab.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  }
  await page.getByRole('textbox', { name: 'نام تنظیمات', exact: true }).fill('اشتراکی');
  await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات فعلی', exact: true }).click();
  await expect(other.getByRole('button', { name: 'اعمال اشتراکی', exact: true })).toBeVisible();
  const tile = other.getByRole('spinbutton', { name: 'اندازهٔ کاشی', exact: true });
  await tile.fill('60');
  await tile.press('Enter');
  other.once('dialog', (dialog) => dialog.accept());
  await other.getByRole('button', { name: 'حذف اشتراکی', exact: true }).click();
  await expect(page.getByRole('button', { name: 'اعمال اشتراکی', exact: true })).toHaveCount(0);
  await expect(tile).toHaveValue('60');
  await expect(page.getByRole('spinbutton', { name: 'اندازهٔ کاشی', exact: true })).toHaveValue(
    '40',
  );
  await other.close();
});

test('blocked localStorage does not prevent editing or portable export and recovery saves current state', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    (window as unknown as { testStorageBlocked: boolean }).testStorageBlocked = true;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        if ((window as unknown as { testStorageBlocked: boolean }).testStorageBlocked)
          throw new DOMException('Synthetic storage block', 'SecurityError');
        return original.get!.call(window);
      },
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('alert').filter({ hasText: 'بازیابی ذخیرهٔ محلی ناموفق بود' }),
  ).toBeVisible();
  const modeWarning = page
    .getByRole('status')
    .filter({ hasText: 'ترجیح حالت رابط خوانده یا ذخیره نشد' });
  await expect(modeWarning).toBeVisible();
  await page.getByRole('radio', { name: 'حرفه‌ای', exact: true }).check();
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('6');
  await wall.press('Enter');
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ذخیرهٔ فایل پروژه', exact: true }).click();
  const path = await (await event).path();
  expect(path).not.toBeNull();
  expect(JSON.parse(strFromU8(gunzipSync(new Uint8Array(await readFile(path!))))).state.wall).toBe(
    6,
  );
  await expect(page.getByRole('alert').filter({ hasText: /^ذخیرهٔ محلی ناموفق بود/ })).toBeVisible({
    timeout: 10_000,
  });
  await page.evaluate(() => {
    (window as unknown as { testStorageBlocked: boolean }).testStorageBlocked = false;
  });
  await page
    .getByRole('alert')
    .filter({ hasText: /^ذخیرهٔ محلی ناموفق بود/ })
    .getByRole('button', { name: 'تلاش دوباره', exact: true })
    .click();
  await expect(page.locator('header')).toContainText('✓ ذخیره شد');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('patturn:editor-history:v1')!).entries[0].state.wall,
    ),
  ).toBe(6);
  await page.getByRole('radio', { name: 'ساده', exact: true }).check();
  await expect(modeWarning).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('renaming a saved recipe supports cancel and preserves its values across reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  await page.getByRole('textbox', { name: 'نام تنظیمات', exact: true }).fill('قدیمی');
  await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات فعلی', exact: true }).click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'تغییر نام قدیمی', exact: true }).click();
  await expect(page.getByRole('button', { name: 'اعمال قدیمی', exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept('جدید'));
  await page.getByRole('button', { name: 'تغییر نام قدیمی', exact: true }).click();
  await expect(page.getByRole('button', { name: 'اعمال قدیمی', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'اعمال جدید', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  const tile = page.getByRole('spinbutton', { name: 'اندازهٔ کاشی', exact: true });
  await tile.fill('60');
  await tile.press('Enter');
  await page.getByRole('button', { name: 'اعمال جدید', exact: true }).click();
  await expect(tile).toHaveValue('40');
});

test('updating a named recipe requires confirmation and preserves the saved name after reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  await page.getByRole('textbox', { name: 'نام تنظیمات', exact: true }).fill('قابل ویرایش');
  await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات فعلی', exact: true }).click();
  const tile = page.getByRole('spinbutton', { name: 'اندازهٔ کاشی', exact: true });
  await tile.fill('60');
  await tile.press('Enter');
  await page.getByRole('radio', { name: 'موج', exact: true }).check();
  const update = page.getByRole('button', {
    name: 'به‌روزرسانی قابل ویرایش با مقادیر فعلی',
    exact: true,
  });
  const before = await page.evaluate(() => localStorage.getItem('patturn:pattern-library:v1'));
  page.once('dialog', (dialog) => dialog.dismiss());
  await update.click();
  expect(await page.evaluate(() => localStorage.getItem('patturn:pattern-library:v1'))).toBe(
    before,
  );
  page.once('dialog', (dialog) => dialog.accept());
  await update.click();
  await page.reload();
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  await tile.fill('40');
  await tile.press('Enter');
  await page.getByRole('radio', { name: 'لوزی', exact: true }).check();
  await page.getByRole('button', { name: 'اعمال قابل ویرایش', exact: true }).click();
  await expect(tile).toHaveValue('60');
  await expect(page.getByRole('radio', { name: 'موج', exact: true })).toBeChecked();
});

test('library backup downloads all named recipes without changing the active project', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  const name = page.getByRole('textbox', { name: 'نام تنظیمات', exact: true });
  await name.fill('نقطه');
  await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات فعلی', exact: true }).click();
  const tile = page.getByRole('spinbutton', { name: 'اندازهٔ کاشی', exact: true });
  await tile.fill('60');
  await tile.press('Enter');
  await page.getByRole('radio', { name: 'موج', exact: true }).check();
  await name.fill('موج بزرگ');
  await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات فعلی', exact: true }).click();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'دانلود پشتیبان کتابخانهٔ الگو', exact: true }).click();
  const file = await event;
  expect(file.suggestedFilename()).toBe('patturn-pattern-library-v1.json');
  const path = await file.path();
  expect(path).not.toBeNull();
  expect(JSON.parse((await readFile(path!)).toString('utf8'))).toEqual({
    format: 'patturn-pattern-library',
    version: 1,
    entries: [
      { name: 'نقطه', patternId: 'dot-grid', tileSize: 40 },
      { name: 'موج بزرگ', patternId: 'wave', tileSize: 60 },
    ],
  });
  await expect(tile).toHaveValue('60');
  await expect(page.getByRole('radio', { name: 'موج', exact: true })).toBeChecked();
});

test('library backup import requires confirmation, deduplicates and rejects conflicts without changing the project', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  const picker = page.getByLabel('انتخاب پشتیبان کتابخانهٔ الگو', { exact: true });
  const backup = (tileSize: number) => ({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'patturn-pattern-library',
        version: 1,
        entries: [{ name: 'واردشده', patternId: 'wave', tileSize }],
      }),
    ),
  });
  page.once('dialog', (dialog) => dialog.dismiss());
  await picker.setInputFiles(backup(60));
  await expect(
    page.getByRole('button', { name: 'ورود پشتیبان کتابخانهٔ الگو', exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole('button', { name: 'اعمال واردشده', exact: true })).toHaveCount(0);
  page.once('dialog', (dialog) => dialog.accept());
  await picker.setInputFiles(backup(60));
  await expect(page.getByRole('button', { name: 'اعمال واردشده', exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await picker.setInputFiles(backup(60));
  await expect(
    page.getByRole('button', { name: 'ورود پشتیبان کتابخانهٔ الگو', exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole('button', { name: 'اعمال واردشده', exact: true })).toHaveCount(1);
  const before = await page.evaluate(() => localStorage.getItem('patturn:pattern-library:v1'));
  await picker.setInputFiles(backup(80));
  await expect(page.getByRole('alert').filter({ hasText: 'چیزی وارد نشد' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('patturn:pattern-library:v1'))).toBe(
    before,
  );
  await expect(page.getByRole('spinbutton', { name: 'اندازهٔ کاشی', exact: true })).toHaveValue(
    '40',
  );
  await page.getByRole('button', { name: 'اعمال واردشده', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'اندازهٔ کاشی', exact: true })).toHaveValue(
    '60',
  );
});

test('leaving the pattern section discards a late backup read without prompting or writing', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      if (this.name === 'delayed.json') {
        await new Promise<void>((resolve) => {
          (window as unknown as { testReleaseFileRead: () => void }).testReleaseFileRead = resolve;
        });
      }
      const result = await original.call(this);
      (window as unknown as { testFileReadFinished: boolean }).testFileReadFinished = true;
      return result;
    };
  });
  let dialogs = 0;
  page.on('dialog', async (dialog) => {
    dialogs++;
    await dialog.dismiss();
  });
  await page.goto('/');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  const backup = {
    name: 'delayed.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'patturn-pattern-library',
        version: 1,
        entries: [{ name: 'دیررس', patternId: 'wave', tileSize: 60 }],
      }),
    ),
  };
  await page.getByLabel('انتخاب پشتیبان کتابخانهٔ الگو', { exact: true }).setInputFiles(backup);
  await expect(
    page.getByRole('button', { name: 'در حال خواندن پشتیبان…', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '🏺 فرم', exact: true }).click();
  await page.evaluate(() => {
    (window as unknown as { testReleaseFileRead: () => void }).testReleaseFileRead();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { testFileReadFinished: boolean }).testFileReadFinished,
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'ورود پشتیبان کتابخانهٔ الگو', exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole('button', { name: 'اعمال دیررس', exact: true })).toHaveCount(0);
  expect(dialogs).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('patturn:pattern-library:v1'))).toBeNull();
});

test('backup read can be cancelled explicitly and a new import survives the old read completing', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      if (this.name === 'slow.json')
        await new Promise<void>((resolve) => {
          (window as unknown as { testReleaseSlowRead: () => void }).testReleaseSlowRead = resolve;
        });
      const result = await original.call(this);
      if (this.name === 'slow.json')
        (window as unknown as { testSlowReadFinished: boolean }).testSlowReadFinished = true;
      return result;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  const picker = page.getByLabel('انتخاب پشتیبان کتابخانهٔ الگو', { exact: true });
  const backup = (filename: string, name: string) => ({
    name: filename,
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'patturn-pattern-library',
        version: 1,
        entries: [{ name, patternId: 'wave', tileSize: 60 }],
      }),
    ),
  });
  await picker.setInputFiles(backup('slow.json', 'قدیمی'));
  await page.getByRole('button', { name: 'لغو خواندن پشتیبان', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'ورود پشتیبان لغو شد' })).toBeVisible();
  let dialogs = 0;
  page.on('dialog', async (dialog) => {
    dialogs++;
    await dialog.accept();
  });
  await picker.setInputFiles(backup('new.json', 'جدید'));
  await expect(
    page.getByRole('status').filter({ hasText: '۱ تنظیمات جدید افزوده شد' }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { testReleaseSlowRead: () => void }).testReleaseSlowRead();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { testSlowReadFinished: boolean }).testSlowReadFinished,
      ),
    )
    .toBe(true);
  await expect(page.getByRole('button', { name: 'اعمال جدید', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'اعمال قدیمی', exact: true })).toHaveCount(0);
  expect(dialogs).toBe(1);
});

test('a grouped slider gesture returning to its initial value leaves no empty undo step', async ({
  page,
}) => {
  await page.goto('/');
  const undo = page.getByRole('button', { name: /^واگرد/ });
  await expect(undo).toBeDisabled();
  const slider = page.getByRole('slider', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await slider.focus();
  await page.keyboard.down('ArrowUp');
  await expect(slider).toHaveValue('5');
  await page.keyboard.down('ArrowDown');
  await expect(slider).toHaveValue('4');
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('ArrowUp');
  await expect(undo).toBeDisabled();
  await page.keyboard.press('ArrowUp');
  await expect(slider).toHaveValue('5');
  await undo.click();
  await expect(slider).toHaveValue('4');
  await expect(undo).toBeDisabled();
});

test('a net-zero slider gesture after undo preserves the existing redo branch', async ({
  page,
}) => {
  await page.goto('/');
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('6');
  await wall.press('Enter');
  await page.getByRole('button', { name: /^واگرد/ }).click();
  await expect(wall).toHaveValue('4');
  const slider = page.getByRole('slider', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await slider.focus();
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowDown');
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('ArrowUp');
  await expect(wall).toHaveValue('4');
  const redo = page.getByRole('button', { name: /^ازنو/ });
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(wall).toHaveValue('6');
});

test('project undo and redo shortcuts work on a focused slider but leave numeric drafts alone', async ({
  page,
}) => {
  await page.goto('/');
  const slider = page.getByRole('slider', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await slider.focus();
  await page.keyboard.press('ArrowUp');
  await expect(slider).toHaveValue('5');
  await page.keyboard.press('Control+z');
  await expect(slider).toHaveValue('4');
  await page.keyboard.press('Control+Shift+z');
  await expect(slider).toHaveValue('5');
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('12');
  await wall.press('Control+z');
  // Native draft undo must not invoke project undo while the number field is focused.
  await expect(slider).toHaveValue('5');
  await wall.press('Escape');
  await expect(wall).toHaveValue('5');
});

test('physical history shortcuts handle Persian key values without intercepting composing events', async ({
  page,
}) => {
  await page.goto('/');
  const slider = page.getByRole('slider', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await slider.focus();
  await page.keyboard.press('ArrowUp');
  await expect(slider).toHaveValue('5');
  // Synthetic key values exercise the listener; this is not an OS keyboard-layout switch.
  await slider.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ظ',
        code: 'KeyZ',
        ctrlKey: true,
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect(slider).toHaveValue('5');
  const undoAllowed = await slider.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ظ',
        code: 'KeyZ',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(undoAllowed).toBe(false);
  await expect(slider).toHaveValue('4');
  await slider.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ظ',
        code: 'KeyZ',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect(slider).toHaveValue('5');
});

test('cancelling a delayed project read preserves current edits and suppresses replacement prompts', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      if (this.name === 'delayed.patturn')
        await new Promise<void>((resolve) => {
          (window as unknown as { testReleaseProjectRead: () => void }).testReleaseProjectRead =
            resolve;
        });
      return original.call(this);
    };
  });
  await page.goto('/');
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('6');
  await wall.press('Enter');
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ذخیرهٔ فایل پروژه', exact: true }).click();
  const path = await (await event).path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  await wall.fill('8');
  await wall.press('Enter');
  let dialogs = 0;
  page.on('dialog', async (dialog) => {
    dialogs++;
    await dialog.dismiss();
  });
  await page.getByLabel('انتخاب فایل پروژه', { exact: true }).setInputFiles({
    name: 'delayed.patturn',
    mimeType: 'application/octet-stream',
    buffer: bytes,
  });
  await page.getByRole('button', { name: 'لغو بازکردن پروژه', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'بازکردن پروژه لغو شد' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'در حال خواندن…', exact: true })).toBeDisabled();
  await page.evaluate(() => {
    (window as unknown as { testReleaseProjectRead: () => void }).testReleaseProjectRead();
  });
  await expect(page.getByRole('button', { name: 'بازکردن پروژه', exact: true })).toBeEnabled();
  await expect(wall).toHaveValue('8');
  expect(dialogs).toBe(0);
});

test('numeric draft ignores composing Enter and Escape before ordinary commit', async ({
  page,
}) => {
  await page.goto('/');
  const number = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  const slider = page.getByRole('slider', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await number.fill('7');
  for (const key of ['Enter', 'Escape']) {
    const allowed = await number.evaluate(
      (element, key) =>
        element.dispatchEvent(
          new KeyboardEvent('keydown', {
            key,
            isComposing: true,
            bubbles: true,
            cancelable: true,
          }),
        ),
      key,
    );
    expect(allowed).toBe(true);
    await expect(number).toBeFocused();
    await expect(number).toHaveValue('7');
    await expect(slider).toHaveValue('4');
  }
  await number.press('Enter');
  await expect(slider).toHaveValue('7');
  await page.getByRole('button', { name: /^واگرد/ }).click();
  await expect(slider).toHaveValue('4');
});

test('a cancelled project read ignores late failure and permits a successful retry', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      if (this.name === 'late-error.patturn') {
        await new Promise<void>((_, reject) => {
          (window as unknown as { testRejectProjectRead: () => void }).testRejectProjectRead = () =>
            reject(new Error('LATE_READ_FAILURE'));
        });
      }
      return original.call(this);
    };
  });
  await page.goto('/');
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('6');
  await wall.press('Enter');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ذخیرهٔ فایل پروژه', exact: true }).click();
  const path = await (await download).path();
  expect(path).not.toBeNull();
  const buffer = await readFile(path!);
  await wall.fill('8');
  await wall.press('Enter');
  const picker = page.getByLabel('انتخاب فایل پروژه', { exact: true });
  await picker.setInputFiles({
    name: 'late-error.patturn',
    mimeType: 'application/octet-stream',
    buffer,
  });
  await page.getByRole('button', { name: 'لغو بازکردن پروژه', exact: true }).click();
  await page.evaluate(() => {
    (window as unknown as { testRejectProjectRead: () => void }).testRejectProjectRead();
  });
  // Await the finally branch, not an arbitrary delay, before asserting that no stale error won.
  await expect(page.getByRole('button', { name: 'بازکردن پروژه', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert').filter({ hasText: 'بازکردن پروژه لغو شد' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'فایل پروژه باز نشد' })).toHaveCount(0);
  await expect(wall).toHaveValue('8');
  const confirmation = page.waitForEvent('dialog');
  await picker.setInputFiles({
    name: 'retry.patturn',
    mimeType: 'application/octet-stream',
    buffer,
  });
  const dialog = await confirmation;
  expect(dialog.type()).toBe('confirm');
  await dialog.accept();
  await expect(wall).toHaveValue('6');
  await expect(page.getByRole('alert').filter({ hasText: 'بازکردن پروژه لغو شد' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'بازکردن پروژه', exact: true })).toBeEnabled();
});

test('numeric corrections report clamping and invalid drafts without adding empty history steps', async ({
  page,
}) => {
  await page.goto('/');
  const number = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  const control = page.locator('.ctl').filter({ has: number });
  await number.fill('100');
  await number.press('Enter');
  await expect(number).toHaveValue('20');
  await expect(control.getByRole('status')).toContainText('مقدار به ۲۰ mm');
  await number.fill('');
  await expect(control.getByRole('status')).toBeEmpty();
  await number.press('Enter');
  await expect(number).toHaveValue('20');
  await expect(control.getByRole('status')).toContainText('مقدار قبلی حفظ شد');
  await page.getByRole('button', { name: /^واگرد/ }).click();
  await expect(number).toHaveValue('4');
  await expect(control.getByRole('status')).toBeEmpty();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  await page.getByRole('button', { name: /^ازنو/ }).click();
  await expect(number).toHaveValue('20');
  await expect(control.getByRole('status')).toBeEmpty();
});

test('profile undo and redo commands display Persian form names', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'سطل گشاد', exact: true }).check();
  const undo = page.getByRole('button', { name: 'واگرد: فرم: گلدان مرجع ← سطل گشاد', exact: true });
  await expect(undo).toHaveAttribute('title', 'فرم: گلدان مرجع ← سطل گشاد');
  await undo.click();
  await expect(page.getByRole('radio', { name: 'گلدان مرجع (۱۱۳۱ml)', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'ازنو: فرم: گلدان مرجع ← سطل گشاد', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'سطل گشاد', exact: true })).toBeChecked();
});

test('pattern undo and redo use the same Persian names as the pattern library', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByRole('radio', { name: 'شبکهٔ مربعی', exact: true }).check();
  await page
    .getByRole('button', { name: 'واگرد: الگو: شبکهٔ نقطه‌ای ← شبکهٔ مربعی', exact: true })
    .click();
  await expect(page.getByRole('radio', { name: 'شبکهٔ نقطه‌ای', exact: true })).toBeChecked();
  await page
    .getByRole('button', { name: 'ازنو: الگو: شبکهٔ نقطه‌ای ← شبکهٔ مربعی', exact: true })
    .click();
  await expect(page.getByRole('radio', { name: 'شبکهٔ مربعی', exact: true })).toBeChecked();
});

test('saved recipe summaries distinguish pattern types and applying a reloaded item restores its values', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  const save = async (name: string) => {
    await page.getByLabel('نام تنظیمات', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات فعلی', exact: true }).click();
  };
  await save('نمونه نقطه');
  await page.getByRole('radio', { name: 'شبکهٔ مربعی', exact: true }).check();
  await save('نمونه مربع');
  await page.reload();
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  const dot = page
    .locator('.saved-patterns li')
    .filter({ has: page.getByRole('button', { name: 'اعمال نمونه نقطه', exact: true }) });
  const grid = page
    .locator('.saved-patterns li')
    .filter({ has: page.getByRole('button', { name: 'اعمال نمونه مربع', exact: true }) });
  await expect(dot).toContainText('نمونه نقطه — شبکهٔ نقطه‌ای — ۴۰ میلی‌متر');
  await expect(grid).toContainText('نمونه مربع — شبکهٔ مربعی — ۴۰ میلی‌متر');
  await dot.getByRole('button', { name: 'اعمال نمونه نقطه', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'شبکهٔ نقطه‌ای', exact: true })).toBeChecked();
  await grid.getByRole('button', { name: 'اعمال نمونه مربع', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'شبکهٔ مربعی', exact: true })).toBeChecked();
});

test('saved recipe search filters Persian names and pattern types without applying or deleting entries', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  await page.getByLabel('نام تنظیمات', { exact: true }).fill('کاشی اول');
  await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات فعلی', exact: true }).click();
  await page.getByRole('radio', { name: 'شبکهٔ مربعی', exact: true }).check();
  await page.getByLabel('نام تنظیمات', { exact: true }).fill('نمونه دوم');
  await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات فعلی', exact: true }).click();
  const search = page.getByLabel('جست‌وجوی تنظیمات ذخیره‌شده', { exact: true });
  const list = page.locator('.saved-patterns li');
  await search.fill('كَاشي');
  await expect(list).toHaveCount(1);
  await expect(list).toContainText('کاشی اول');
  await expect(page.getByRole('radio', { name: 'شبکهٔ مربعی', exact: true })).toBeChecked();
  await search.fill('مربعی');
  await expect(list).toHaveCount(1);
  await expect(list).toContainText('نمونه دوم');
  await search.fill('ناشناخته');
  await expect(list).toHaveCount(0);
  await expect(
    page.getByText('تنظیماتی پیدا نشد؛ نام تنظیمات یا نوع الگو را جست‌وجو کنید.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'پاک‌کردن جست‌وجوی تنظیمات', exact: true }).click();
  await expect(search).toBeFocused();
  await expect(list).toHaveCount(2);
  await page.reload();
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  await expect(list).toHaveCount(2);
});

test('clearing pattern search by keyboard restores input focus and permits immediate typing', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  const library = page.getByRole('group', { name: 'الگوهای آماده', exact: true });
  const search = library.getByRole('searchbox', { name: 'جست‌وجوی الگو', exact: true });
  await search.fill('ناشناخته');
  await expect(library.getByRole('radio')).toHaveCount(0);
  const clear = library.getByRole('button', { name: 'پاک‌کردن جست‌وجو', exact: true });
  await clear.focus();
  await page.keyboard.press('Enter');
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  await expect(library.getByRole('radio')).toHaveCount(12);
  await expect(library.getByRole('radio', { name: 'شبکهٔ نقطه‌ای', exact: true })).toBeChecked();
  await page.keyboard.type('grid');
  await expect(search).toHaveValue('grid');
  await expect(library.getByRole('radio')).toHaveCount(2);
});

test('library backup includes hidden recipes while a search filter is active', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  await page.getByLabel('نام تنظیمات', { exact: true }).fill('آشکار');
  await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات فعلی', exact: true }).click();
  await page.getByRole('radio', { name: 'شبکهٔ مربعی', exact: true }).check();
  await page.getByLabel('نام تنظیمات', { exact: true }).fill('پنهان');
  await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات فعلی', exact: true }).click();
  const search = page.getByLabel('جست‌وجوی تنظیمات ذخیره‌شده', { exact: true });
  await search.fill('آشکار');
  const list = page.locator('.saved-patterns li');
  await expect(list).toHaveCount(1);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'دانلود پشتیبان کتابخانهٔ الگو', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('patturn-pattern-library-v1.json');
  const path = await file.path();
  expect(path).not.toBeNull();
  expect(JSON.parse(await readFile(path!, 'utf8'))).toEqual({
    format: 'patturn-pattern-library',
    version: 1,
    entries: [
      { name: 'آشکار', patternId: 'dot-grid', tileSize: 40 },
      { name: 'پنهان', patternId: 'grid', tileSize: 40 },
    ],
  });
  await expect(search).toHaveValue('آشکار');
  await expect(list).toHaveCount(1);
  await expect(page.getByRole('radio', { name: 'شبکهٔ مربعی', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'پاک‌کردن جست‌وجوی تنظیمات', exact: true }).click();
  await expect(list).toHaveCount(2);
});

test('hidden active pattern can be revealed without changing project selection or history', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  const library = page.getByRole('group', { name: 'الگوهای آماده', exact: true });
  await library.getByRole('radio', { name: 'شبکهٔ مربعی', exact: true }).check();
  const undo = page.getByRole('button', { name: /^واگرد/ });
  await expect(undo).toBeEnabled();
  const title = await undo.getAttribute('title');
  const search = library.getByRole('searchbox', { name: 'جست‌وجوی الگو', exact: true });
  await search.fill('dot');
  await expect(library.getByRole('radio')).toHaveCount(1);
  await expect(
    library.getByText(
      'الگوی فعال «شبکهٔ مربعی» در نتایج جست‌وجو پنهان است؛ انتخاب پروژه تغییر نکرده است.',
      { exact: true },
    ),
  ).toBeVisible();
  const reveal = library.getByRole('button', { name: 'نمایش الگوی فعال', exact: true });
  await reveal.focus();
  await page.keyboard.press('Enter');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(library.getByRole('radio', { name: 'شبکهٔ مربعی', exact: true })).toBeChecked();
  await expect(reveal).toHaveCount(0);
  await expect(undo).toHaveAttribute('title', title!);
  await undo.click();
  await expect(library.getByRole('radio', { name: 'شبکهٔ نقطه‌ای', exact: true })).toBeChecked();
  await expect(undo).toBeDisabled();
});

test('recipe rename and deletion restore search focus only after successful confirmation', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  await page.getByLabel('نام تنظیمات', { exact: true }).fill('اول');
  await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات فعلی', exact: true }).click();
  const search = page.getByLabel('جست‌وجوی تنظیمات ذخیره‌شده', { exact: true });
  const rename = page.getByRole('button', { name: 'تغییر نام اول', exact: true });
  await rename.focus();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.keyboard.press('Enter');
  await expect(rename).toBeFocused();
  await expect(page.locator('.saved-patterns li')).toHaveCount(1);
  page.once('dialog', (dialog) => dialog.accept('دوم'));
  await page.keyboard.press('Enter');
  await expect(search).toBeFocused();
  const remove = page.getByRole('button', { name: 'حذف دوم', exact: true });
  await expect(remove).toBeVisible();
  await remove.focus();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.keyboard.press('Enter');
  await expect(remove).toBeFocused();
  await expect(page.locator('.saved-patterns li')).toHaveCount(1);
  page.once('dialog', (dialog) => dialog.accept());
  await page.keyboard.press('Enter');
  await expect(search).toBeFocused();
  await expect(page.locator('.saved-patterns li')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'شبکهٔ نقطه‌ای', exact: true })).toBeChecked();
});

test('saved recipe search matches Persian Arabic and Latin digits without renaming stored entries', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  for (const name of ['کاشی ۱۲', 'کاشی ۳۴']) {
    await page.getByLabel('نام تنظیمات', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات فعلی', exact: true }).click();
  }
  const search = page.getByLabel('جست‌وجوی تنظیمات ذخیره‌شده', { exact: true });
  const list = page.locator('.saved-patterns li');
  for (const query of ['12', '١٢', '۱۲']) {
    await search.fill(query);
    await expect(list).toHaveCount(1);
    await expect(list.getByRole('button', { name: 'اعمال کاشی ۱۲', exact: true })).toBeVisible();
  }
  await search.fill('34');
  await expect(list).toHaveCount(1);
  await expect(list.getByRole('button', { name: 'اعمال کاشی ۳۴', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  await expect(list).toHaveCount(2);
  await expect(list.getByRole('button', { name: 'اعمال کاشی ۱۲', exact: true })).toBeVisible();
  await expect(list.getByRole('button', { name: 'اعمال کاشی ۳۴', exact: true })).toBeVisible();
});

test('failed browser delivery can be discarded and a fresh output downloaded without changing the project', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL);
    let fail = true;
    URL.createObjectURL = (blob) => {
      if (fail) {
        fail = false;
        throw new Error('SIMULATED_BROWSER_DELIVERY_FAILURE');
      }
      return create(blob);
    };
  });
  await page.goto('/');
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('7');
  await wall.press('Enter');
  const undo = page.getByRole('button', { name: /^واگرد/ });
  await expect(undo).toBeEnabled();
  const title = await undo.getAttribute('title');
  await page.getByRole('button', { name: 'خروجی SVG الگو', exact: true }).click();
  const failure = page.getByRole('alert').filter({ hasText: 'ممکن است فایل مقصد ناقص باشد' });
  await expect(failure).toBeVisible();
  await expect(
    failure.getByRole('button', { name: 'تلاش دوبارهٔ همان خروجی', exact: true }),
  ).toBeVisible();
  await failure.getByRole('button', { name: 'کنارگذاشتن خروجی ناموفق', exact: true }).click();
  await expect(failure).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'تلاش دوبارهٔ همان خروجی', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'خروجی ناموفق کنار گذاشته شد' }),
  ).toBeVisible();
  await expect(wall).toHaveValue('7');
  await expect(undo).toHaveAttribute('title', title!);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'خروجی SVG الگو', exact: true }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(/\.svg$/);
  const path = await file.path();
  expect(path).not.toBeNull();
  const svg = await readFile(path!, 'utf8');
  expect(svg).toContain('<svg');
  expect(svg).toContain('<path');
  await expect(
    page.getByRole('status').filter({ hasText: 'درخواست دانلود به مرورگر ارسال شد' }),
  ).toBeVisible();
  await expect(wall).toHaveValue('7');
  await expect(undo).toHaveAttribute('title', title!);
});

test('a failed download click releases its Blob URL and retry delivers the retained snapshot', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    const click = HTMLAnchorElement.prototype.click;
    const audit = { created: [] as string[], revoked: [] as string[], blobs: [] as Blob[] };
    (window as unknown as { testDownloadAudit: typeof audit }).testDownloadAudit = audit;
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      audit.created.push(url);
      audit.blobs.push(blob as Blob);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      audit.revoked.push(url);
      revoke(url);
    };
    let fail = true;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && fail) {
        fail = false;
        throw new Error('SIMULATED_DOWNLOAD_CLICK_FAILURE');
      }
      click.call(this);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'خروجی SVG الگو', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'ممکن است فایل مقصد ناقص باشد' }),
  ).toBeVisible();
  const first = await page.evaluate(() => {
    const audit = (
      window as unknown as { testDownloadAudit: { created: string[]; revoked: string[] } }
    ).testDownloadAudit;
    return { created: audit.created, revoked: audit.revoked };
  });
  expect(first.created).toHaveLength(1);
  expect(first.revoked).toEqual(first.created);
  // Change the active pattern after failure; retry must still deliver the old snapshot.
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByRole('radio', { name: 'شبکهٔ مربعی', exact: true }).check();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'تلاش دوبارهٔ همان خروجی', exact: true }).click();
  const file = await downloaded;
  const path = await file.path();
  expect(path).not.toBeNull();
  const original = await page.evaluate(async () => {
    const audit = (window as unknown as { testDownloadAudit: { blobs: Blob[] } }).testDownloadAudit;
    return { text: await audit.blobs[0]!.text(), type: audit.blobs[0]!.type };
  });
  expect(await readFile(path!, 'utf8')).toBe(original.text);
  expect(original.type).toBe('image/svg+xml');
  await expect(page.getByRole('radio', { name: 'شبکهٔ مربعی', exact: true })).toBeChecked();
  await expect(
    page.getByRole('button', { name: 'تلاش دوبارهٔ همان خروجی', exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const audit = (
          window as unknown as { testDownloadAudit: { created: string[]; revoked: string[] } }
        ).testDownloadAudit;
        return (
          audit.revoked.length === 2 &&
          audit.created.length === 2 &&
          audit.revoked.every((url, index) => url === audit.created[index])
        );
      }),
    )
    .toBe(true);
});

test('physical history fallback does not hijack Latin remapped or dead keys', async ({ page }) => {
  await page.goto('/');
  const slider = page.getByRole('slider', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await slider.focus();
  await page.keyboard.press('ArrowUp');
  await expect(slider).toHaveValue('5');
  for (const key of ['a', 'w', 'Dead', 'Process', 'Unidentified']) {
    const allowed = await slider.evaluate(
      (element, key) =>
        element.dispatchEvent(
          new KeyboardEvent('keydown', {
            key,
            code: 'KeyZ',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          }),
        ),
      key,
    );
    expect(allowed).toBe(true);
    await expect(slider).toHaveValue('5');
  }
  const allowed = await slider.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ظ',
        code: 'KeyZ',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(allowed).toBe(false);
  await expect(slider).toHaveValue('4');
});

test('saved recipe matches follow current pattern and tile values including undo and redo', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  for (const name of ['نقطه اول', 'نقطه دوم']) {
    await page.getByLabel('نام تنظیمات', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات فعلی', exact: true }).click();
  }
  const matches = page.locator('.saved-patterns li').filter({ hasText: 'مطابق تنظیمات فعلی' });
  await expect(matches).toHaveCount(2);
  await page.getByRole('radio', { name: 'شبکهٔ مربعی', exact: true }).check();
  await expect(matches).toHaveCount(0);
  await page.getByRole('button', { name: /^واگرد/ }).click();
  await expect(matches).toHaveCount(2);
  await page.getByRole('button', { name: /^ازنو/ }).click();
  await expect(matches).toHaveCount(0);
  await page.getByRole('button', { name: 'اعمال نقطه اول', exact: true }).click();
  await expect(matches).toHaveCount(2);
  const tile = page.getByRole('spinbutton', { name: 'اندازهٔ کاشی', exact: true });
  await tile.fill('41');
  await tile.press('Enter');
  await expect(matches).toHaveCount(0);
  await page.getByRole('button', { name: /^واگرد/ }).click();
  await expect(matches).toHaveCount(2);
  await page.getByRole('button', { name: 'اعمال نقطه دوم', exact: true }).click();
  await expect(page.locator('.saved-patterns li')).toHaveCount(2);
  await expect(matches).toHaveCount(2);
});

test('applying a saved recipe revalidates storage rather than trusting stale displayed values', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  await page.getByLabel('نام تنظیمات', { exact: true }).fill('قابل تغییر');
  await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات فعلی', exact: true }).click();
  const row = page.locator('.saved-patterns li');
  await expect(row).toContainText('شبکهٔ نقطه‌ای');
  // Same-document writes deliberately do not emit storage events. This leaves the
  // displayed row stale and tests click-time validation independently of refresh.
  await page.evaluate(() => {
    const key = 'patturn:pattern-library:v1';
    const doc = JSON.parse(localStorage.getItem(key)!);
    doc.entries[0].patternId = 'grid';
    doc.entries[0].tileSize = 61;
    localStorage.setItem(key, JSON.stringify(doc));
  });
  await expect(row).toContainText('شبکهٔ نقطه‌ای');
  const apply = page.getByRole('button', { name: 'اعمال قابل تغییر', exact: true });
  await apply.click();
  await expect(page.getByRole('radio', { name: 'شبکهٔ مربعی', exact: true })).toBeChecked();
  await expect(page.getByRole('spinbutton', { name: 'اندازهٔ کاشی', exact: true })).toHaveValue(
    '61',
  );
  await expect(row).toContainText('شبکهٔ مربعی — ۶۱ میلی‌متر');
  const undo = page.getByRole('button', { name: /^واگرد/ });
  await expect(undo).toBeEnabled();
  const title = await undo.getAttribute('title');
  await page.evaluate(() =>
    localStorage.setItem('patturn:pattern-library:v1', JSON.stringify({ version: 1, entries: [] })),
  );
  await apply.click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'این تنظیمات دیگر در کتابخانه نیست' }),
  ).toBeVisible();
  await expect(page.getByRole('radio', { name: 'شبکهٔ مربعی', exact: true })).toBeChecked();
  await expect(page.getByRole('spinbutton', { name: 'اندازهٔ کاشی', exact: true })).toHaveValue(
    '61',
  );
  await expect(undo).toHaveAttribute('title', title!);
  await page.getByRole('button', { name: 'بازخوانی / تلاش دوباره', exact: true }).click();
  await expect(row).toHaveCount(0);
});

test('empty saved library guidance is distinct from a search with no matches', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '🔷 الگو', exact: true }).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده', { exact: true }).click();
  const empty = page.getByText(
    'هنوز تنظیماتی در این کتابخانه نیست؛ به تنظیمات فعلی نام بدهید و آن را ذخیره کنید، یا پشتیبان کتابخانه را وارد کنید.',
    { exact: true },
  );
  const noMatch = page.getByText('تنظیماتی پیدا نشد؛ نام تنظیمات یا نوع الگو را جست‌وجو کنید.', {
    exact: true,
  });
  await expect(empty).toBeVisible();
  await expect(noMatch).toHaveCount(0);
  await page.getByLabel('نام تنظیمات', { exact: true }).fill('نمونه');
  await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات فعلی', exact: true }).click();
  await expect(empty).toHaveCount(0);
  await page.getByLabel('جست‌وجوی تنظیمات ذخیره‌شده', { exact: true }).fill('ناشناخته');
  await expect(noMatch).toBeVisible();
  await expect(empty).toHaveCount(0);
  await page.getByRole('button', { name: 'پاک‌کردن جست‌وجوی تنظیمات', exact: true }).click();
  await expect(noMatch).toHaveCount(0);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'حذف نمونه', exact: true }).click();
  await expect(empty).toBeVisible();
  await expect(noMatch).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'شبکهٔ نقطه‌ای', exact: true })).toBeChecked();
  await page.evaluate(() => localStorage.setItem('patturn:pattern-library:v1', '{broken'));
  await page.getByRole('button', { name: 'بازخوانی / تلاش دوباره', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'کتابخانه خوانده یا ذخیره نشد' }),
  ).toBeVisible();
  await expect(empty).toHaveCount(0);
  await expect(noMatch).toHaveCount(0);
});

test('privacy notice opens by keyboard using packaged text and preserves project history', async ({
  page,
}) => {
  await page.goto('/');
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('7');
  await wall.press('Enter');
  const undo = page.getByRole('button', { name: /^واگرد/ });
  await expect(undo).toBeEnabled();
  const title = await undo.getAttribute('title');
  const summary = page.getByText('حریم خصوصی و داده‌های محلی', { exact: true });
  await summary.focus();
  await page.keyboard.press('Enter');
  const notice = page.getByRole('region', { name: 'اطلاعیهٔ حریم خصوصی', exact: true });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('localStorage');
  await expect(notice).toContainText('رمزگذاری اختصاصی برنامه محافظت نمی‌شوند');
  await expect(notice).toContainText('اجرای کاملاً آفلاین نسخهٔ نصب‌شده هنوز تأیید عملی نشده است');
  await expect(wall).toHaveValue('7');
  await expect(undo).toHaveAttribute('title', title!);
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(notice).not.toBeVisible();
});

test('optional support copies only the card number and reports clipboard denial without touching the project', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const audit = { text: '', deny: false };
    (window as unknown as { testSupportClipboard: typeof audit }).testSupportClipboard = audit;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          if (audit.deny) throw Error('denied');
          audit.text = text;
        },
      },
    });
  });
  await page.goto('/');
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('7');
  await wall.press('Enter');
  const undo = page.getByRole('button', { name: /^واگرد/ });
  await expect(undo).toBeEnabled();
  const title = await undo.getAttribute('title');
  const panel = page.getByRole('region', { name: 'حمایت اختیاری و پشتیبانی', exact: true });
  const button = panel.getByRole('button', { name: 'کپی شمارهٔ کارت حمایت', exact: true });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('status')).toContainText('شمارهٔ کارت کپی شد');
  const copied = await page.evaluate(() => {
    const audit = (window as unknown as { testSupportClipboard: { text: string; deny: boolean } })
      .testSupportClipboard;
    audit.deny = true;
    return audit.text;
  });
  expect(copied).toMatch(/^\d{16}$/);
  await expect(panel.locator('p[dir="ltr"]').first()).toHaveText(copied.match(/.{4}/g)!.join(' '));
  await button.click();
  await expect(panel.getByRole('alert')).toContainText('دستی انتخاب و کپی کنید');
  await expect(wall).toHaveValue('7');
  await expect(undo).toHaveAttribute('title', title!);
});

test('optional local profile persists separately and can be deleted without changing the project', async ({
  page,
}) => {
  await page.goto('/');
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('7');
  await wall.press('Enter');
  const summary = page.getByText('پروفایل محلی و تنظیمات نمایش نام', { exact: true });
  await summary.click();
  await page.getByLabel('نام پروفایل محلی', { exact: true }).fill('کاربر آزمایشی');
  await page.getByLabel('ایمیل پروفایل محلی', { exact: true }).fill('local@example.com');
  await page.getByRole('checkbox', { name: 'نمایش نام ذخیره‌شده در این بخش', exact: true }).check();
  await page.getByRole('button', { name: 'ذخیرهٔ پروفایل محلی', exact: true }).click();
  await expect(page.getByText('پروفایل محلی: کاربر آزمایشی', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ذخیرهٔ فایل پروژه', exact: true }).click();
  const path = await (await download).path();
  expect(path).not.toBeNull();
  const project = strFromU8(gunzipSync(new Uint8Array(await readFile(path!))));
  expect(project).not.toContain('local@example.com');
  expect(project).not.toContain('کاربر آزمایشی');
  await expect(page.locator('.saved')).toHaveText('✓ ذخیره شد');
  await page.reload();
  await summary.click();
  await expect(wall).toHaveValue('7');
  await expect(page.getByLabel('نام پروفایل محلی', { exact: true })).toHaveValue('کاربر آزمایشی');
  await expect(
    page.getByRole('checkbox', { name: 'نمایش نام ذخیره‌شده در این بخش', exact: true }),
  ).toBeChecked();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'حذف پروفایل محلی', exact: true }).click();
  await expect(page.getByLabel('نام پروفایل محلی', { exact: true })).toHaveValue('کاربر آزمایشی');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'حذف پروفایل محلی', exact: true }).click();
  await expect(page.getByLabel('نام پروفایل محلی', { exact: true })).toHaveValue('');
  await expect(wall).toHaveValue('7');
});

test('corrupt local profile cannot be overwritten implicitly and explicit deletion recovers editing', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('patturn:local-profile:v1', '{broken'));
  await page.goto('/');
  await page.getByText('پروفایل محلی و تنظیمات نمایش نام', { exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'پروفایل محلی خوانده نشد' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'ذخیرهٔ پروفایل محلی', exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('patturn:local-profile:v1'))).toBe(
    '{broken',
  );
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'حذف پروفایل محلی', exact: true }).click();
  await expect(page.getByRole('button', { name: 'ذخیرهٔ پروفایل محلی', exact: true })).toBeEnabled();
  await page.getByLabel('نام پروفایل محلی', { exact: true }).fill('تازه');
  await page.getByRole('button', { name: 'ذخیرهٔ پروفایل محلی', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'پروفایل فقط روی همین دستگاه ذخیره شد' }),
  ).toBeVisible();
});

test('chuck tool exports a validated tapered support independently of the project form', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('چاک‌ساز — شیب ۲ درجه و سوراخ تخلیه', { exact: true }).click();
  const height = page.getByRole('spinbutton', { name: 'ارتفاع چاک', exact: true });
  await height.fill('50');
  await height.press('Enter');
  await expect(
    page.getByRole('img', {
      name: 'مقطع شماتیک چاک؛ سوراخ محوری در هر دو سر باز است',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'مش بسته و اعتبارسنجی‌شده؛ سوراخ تخلیه باز است' }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'دانلود STL چاک', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('chuck_taper2deg_D80-H50-drain8mm.stl');
  const path = await file.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  expect(bytes.readUInt32LE(80)).toBe(768);
  expect(bytes.length).toBe(84 + 768 * 50);
  const ys: number[] = [];
  for (let offset = 84; offset < bytes.length; offset += 50) {
    for (let v = 0; v < 3; v++) {
      const start = offset + 12 + 12 * v;
      const x = bytes.readFloatLE(start),
        y = bytes.readFloatLE(start + 4),
        z = bytes.readFloatLE(start + 8);
      expect(Math.hypot(x, z)).toBeGreaterThan(3.999);
      ys.push(y);
    }
  }
  expect(Math.min(...ys)).toBe(0);
  expect(Math.max(...ys)).toBe(50);
  await page.getByRole('button', { name: '🏺 فرم', exact: true }).click();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('rounder tool exports a solid three-degree plug at the chosen nominal mouth diameter', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('رینگ‌روندر — پلاگ مخروطی با شیب ۳ درجه', { exact: true }).click();
  const diameter = page.getByRole('spinbutton', { name: 'قطر اسمی دهانهٔ رینگ‌روندر', exact: true });
  await diameter.fill('60');
  await diameter.press('Enter');
  await expect(
    page.getByRole('img', {
      name: 'مقطع شماتیک رینگ‌روندر با خط قطر اسمی در نیمهٔ ارتفاع',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'مش رینگ‌روندر بسته و اعتبارسنجی‌شده است' }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'دانلود STL رینگ‌روندر', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('rounder_taper3deg_D60-H40mm.stl');
  const path = await file.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  expect(bytes.readUInt32LE(80)).toBe(384);
  expect(bytes.length).toBe(84 + 384 * 50);
  let base = 0,
    tip = 0;
  for (let offset = 84; offset < bytes.length; offset += 50) {
    for (let v = 0; v < 3; v++) {
      const start = offset + 12 + 12 * v;
      const radius = Math.hypot(bytes.readFloatLE(start), bytes.readFloatLE(start + 8));
      const y = bytes.readFloatLE(start + 4);
      expect([0, 40]).toContain(y);
      if (y === 0) base = Math.max(base, radius);
      else tip = Math.max(tip, radius);
    }
  }
  expect(base + tip).toBeCloseTo(60, 4);
  expect((Math.atan((base - tip) / 40) * 180) / Math.PI).toBeCloseTo(3, 4);
  await page.getByRole('button', { name: '🏺 فرم', exact: true }).click();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('horizontal split downloads capped parts and invalidates old results when cut height changes', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('تقسیم افقی فرم در ارتفاع انتخابی', { exact: true }).click();
  await page.getByRole('button', { name: 'ساخت دو قطعهٔ برش افقی', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'دو قطعه بسته و اعتبارسنجی شدند' }),
  ).toBeVisible({ timeout: 60_000 });
  for (const [label, side] of [
    ['پایین', 'lower'],
    ['بالا', 'upper'],
  ] as const) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: `دانلود STL قطعهٔ ${label}`, exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`form_horizontal-${side}_Y50mm.stl`);
    const path = await file.path();
    expect(path).not.toBeNull();
    const bytes = await readFile(path!);
    const tris = bytes.readUInt32LE(80);
    expect(tris).toBeGreaterThan(0);
    expect(bytes.length).toBe(84 + tris * 50);
    let min = Infinity,
      max = -Infinity;
    for (let offset = 84; offset < bytes.length; offset += 50)
      for (let v = 0; v < 3; v++) {
        const y = bytes.readFloatLE(offset + 16 + 12 * v);
        min = Math.min(min, y);
        max = Math.max(max, y);
      }
    if (side === 'lower') expect(max).toBeCloseTo(50, 4);
    else expect(min).toBeCloseTo(50, 4);
  }
  const cut = page.getByRole('spinbutton', { name: 'ارتفاع برش افقی', exact: true });
  await cut.fill('60');
  await cut.press('Enter');
  await expect(
    page.getByRole('button', { name: 'دانلود STL قطعهٔ پایین', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'دانلود STL قطعهٔ بالا', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'ساخت دو قطعهٔ برش افقی', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'دو قطعه بسته و اعتبارسنجی شدند' }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('horizontal split reports WASM failure independently and an explicit retry recovers', async ({
  page,
}) => {
  let allow = false;
  await page.route('**/*.wasm', async (route) => {
    if (allow) await route.continue();
    else await route.abort('failed');
  });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('تقسیم افقی فرم در ارتفاع انتخابی', { exact: true }).click();
  await page.getByRole('button', { name: 'ساخت دو قطعهٔ برش افقی', exact: true }).click();
  const error = page
    .getByRole('alert')
    .filter({ hasText: 'تقسیم افقی ناموفق بود؛ فرم اصلی تغییر نکرد' });
  await expect(error).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'دانلود STL قطعهٔ پایین', exact: true }),
  ).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '⬇ خروجی STL فرم', exact: true }).click();
  await download;
  allow = true;
  await page.getByRole('button', { name: 'ساخت دو قطعهٔ برش افقی', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'دو قطعه بسته و اعتبارسنجی شدند' }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(error).toHaveCount(0);
});

test('jigsaw tool exports deterministic shared-cut SVG and DXF with editable seed', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('الگوی پازل — اتصال jigsaw با seed قطعی', { exact: true }).click();
  const preview = page.getByRole('img', { name: 'پیش‌نمایش خطوط برش الگوی پازل', exact: true });
  await expect(preview.locator('path')).toHaveCount(13);
  const first = await preview.innerHTML();
  const seed = page.getByRole('spinbutton', { name: 'seed پازل', exact: true });
  await seed.fill('43');
  await seed.press('Enter');
  expect(await preview.innerHTML()).not.toBe(first);
  await seed.fill('42');
  await seed.press('Enter');
  expect(await preview.innerHTML()).toBe(first);
  for (const format of ['SVG', 'DXF']) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: `دانلود ${format} پازل`, exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(
      `jigsaw_3x3_cell40-tab3-seed42mm.${format.toLowerCase()}`,
    );
    const path = await file.path();
    expect(path).not.toBeNull();
    const text = await readFile(path!, 'utf8');
    if (format === 'SVG') {
      expect(text).toContain('width="120mm"');
      expect(text.match(/<path /g)).toHaveLength(13);
    } else {
      expect(text).toContain('AC1009');
      expect(text).toContain('LINE');
    }
  }
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('private feature requests persist, sort by votes or newest and export without changing project history', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('درخواست قابلیت — فهرست خصوصی این دستگاه', { exact: true }).click();
  const panel = page.locator('.feature-requests');
  for (const text of ['ابزار اول', 'ابزار دوم']) {
    await panel.getByLabel('متن درخواست قابلیت', { exact: true }).fill(text);
    await panel.getByRole('button', { name: 'ثبت پیشنهاد محلی', exact: true }).click();
  }
  await panel.getByRole('button', { name: 'افزودن رأی محلی: ابزار اول', exact: true }).click();
  await expect(panel.locator('li').first()).toContainText('ابزار اول');
  await panel.getByRole('radio', { name: 'جدیدترین (New)', exact: true }).check();
  await expect(panel.locator('li').first()).toContainText('ابزار دوم');
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'خروجی JSON درخواست‌ها', exact: true }).click();
  const file = await download;
  const path = await file.path();
  expect(path).not.toBeNull();
  const doc = JSON.parse(await readFile(path!, 'utf8'));
  expect(doc.format).toBe('patturn-local-feature-requests');
  expect(
    doc.entries.map((entry: { text: string; votes: number }) => [entry.text, entry.votes]),
  ).toEqual([
    ['ابزار اول', 1],
    ['ابزار دوم', 0],
  ]);
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  await page.reload();
  await page.getByText('درخواست قابلیت — فهرست خصوصی این دستگاه', { exact: true }).click();
  await expect(panel.locator('li')).toHaveCount(2);
  await expect(panel.locator('li').first()).toContainText('ابزار اول');
});

test('corrupt local feature requests do not overwrite data or block project editing', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('patturn:feature-requests:v1', '{broken'));
  await page.goto('/');
  await page.getByText('درخواست قابلیت — فهرست خصوصی این دستگاه', { exact: true }).click();
  const panel = page.locator('.feature-requests');
  await expect(panel.getByRole('alert')).toBeVisible();
  await panel.getByLabel('متن درخواست قابلیت', { exact: true }).fill('تازه');
  await panel.getByRole('button', { name: 'ثبت پیشنهاد محلی', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('patturn:feature-requests:v1'))).toBe(
    '{broken',
  );
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('7');
  await wall.press('Enter');
  await expect(wall).toHaveValue('7');
  await expect(panel.getByRole('status')).toHaveCount(0);
});

test('foot ring unions each edge style with the body and invalidates stale downloads on parameter changes', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('فوت‌رینگ — اتصال حلقهٔ پایه به فرم', { exact: true }).click();
  for (const edge of ['square', 'chamfer', 'round']) {
    await page.getByLabel('سبک لبهٔ فوت‌رینگ', { exact: true }).selectOption(edge);
    await page.getByRole('button', { name: 'ساخت فرم فوت‌رینگ‌دار', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'فوت‌رینگ با بدنه union و مش اعتبارسنجی شد' }),
    ).toBeVisible({ timeout: 60_000 });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'دانلود STL فرم فوت‌رینگ‌دار', exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`form_foot-ring_W6-D4-${edge}mm.stl`);
    const path = await file.path();
    expect(path).not.toBeNull();
    const bytes = await readFile(path!);
    expect(bytes.length).toBe(84 + bytes.readUInt32LE(80) * 50);
    let min = Infinity,
      max = -Infinity;
    for (let offset = 84; offset < bytes.length; offset += 50)
      for (let v = 0; v < 3; v++) {
        const y = bytes.readFloatLE(offset + 16 + 12 * v);
        min = Math.min(min, y);
        max = Math.max(max, y);
      }
    expect(min).toBe(-8);
    expect(max).toBe(144);
  }
  const width = page.getByRole('spinbutton', { name: 'عرض فوت‌رینگ', exact: true });
  await width.fill('7');
  await width.press('Enter');
  await expect(
    page.getByRole('button', { name: 'دانلود STL فرم فوت‌رینگ‌دار', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('developable slab exports real mm SVG and DXF and stays separate from project history', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('اسلب‌تمپلیت — استوانه و مخروط ناقص', { exact: true }).click();
  const preview = page.getByRole('img', { name: 'پیش‌نمایش اسلب تخت', exact: true });
  await expect(preview.locator('path')).toHaveCount(8);
  const initial = await preview.locator('path').first().getAttribute('d');
  const top = page.getByRole('spinbutton', { name: 'شعاع بالای اسلب', exact: true });
  await top.fill('40');
  await top.press('Enter');
  await expect(preview.locator('path').first()).not.toHaveAttribute('d', initial!);
  for (const format of ['SVG', 'DXF']) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: `دانلود ${format} اسلب`, exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(
      `slab_developed_B40-T40-H100-G8mm.${format.toLowerCase()}`,
    );
    const path = await file.path();
    expect(path).not.toBeNull();
    const text = await readFile(path!, 'utf8');
    if (format === 'SVG') {
      expect(text).toContain('width="251.32741228718345mm"');
      expect(text).toContain('height="100mm"');
    } else {
      expect(text).toContain('AC1009');
      expect(text).toContain('LINE');
    }
  }
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('loft and arc sweep export closed-tool STL and leave project history unchanged', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('Loft / Sweep — دو مقطع بیضوی یا مسیر قوسی', { exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'پیش‌نمایش خطی Loft/Sweep', exact: true }).locator('polyline'),
  ).toHaveCount(2);
  for (const mode of ['loft', 'sweep']) {
    await page.getByLabel('روش ساخت Loft/Sweep', { exact: true }).selectOption(mode);
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', {
        name: `دانلود STL ${mode === 'loft' ? 'Loft' : 'Sweep'}`,
        exact: true,
      })
      .click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(
      mode === 'loft' ? 'tool_loft_B30x20-T50x35-H100-X0.stl' : 'tool_sweep_R60-r8-A180.stl',
    );
    const path = await file.path();
    expect(path).not.toBeNull();
    const bytes = await readFile(path!);
    expect(bytes.length).toBe(84 + bytes.readUInt32LE(80) * 50);
    let allFinite = true;
    const mins = [Infinity, Infinity, Infinity],
      maxs = [-Infinity, -Infinity, -Infinity];
    for (let offset = 84; offset < bytes.length; offset += 50)
      for (let v = 0; v < 3; v++)
        for (let axis = 0; axis < 3; axis++) {
          const n = bytes.readFloatLE(offset + 12 + v * 12 + axis * 4);
          allFinite = allFinite && Number.isFinite(n);
          mins[axis] = Math.min(mins[axis]!, n);
          maxs[axis] = Math.max(maxs[axis]!, n);
        }
    expect(allFinite).toBe(true);
    if (mode === 'loft') {
      expect(mins).toEqual([-50, 0, -35]);
      expect(maxs).toEqual([50, 100, 35]);
    } else {
      expect(mins[0]).toBe(-8);
      expect(maxs[0]).toBe(128);
      expect(mins[2]).toBe(-8);
      expect(maxs[2]).toBe(8);
    }
  }
  const radius = page.getByRole('spinbutton', { name: 'شعاع مسیر Sweep', exact: true });
  const tube = page.getByRole('spinbutton', { name: 'شعاع مقطع Sweep', exact: true });
  await tube.fill('30');
  await tube.press('Enter');
  await radius.fill('20');
  await radius.press('Enter');
  await expect(tube).toHaveValue('10');
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('local image trace decodes PNG and exports scaled contour files without editing the project', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('ردیابی تصویر — Otsu و کانتور', { exact: true }).click();
  const panel = page.locator('.image-trace-tool');
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = 'black';
    ctx.fillRect(4, 4, 8, 8);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await panel.getByLabel('تصویر ردیابی', { exact: true }).setInputFiles({
    name: 'square.png',
    mimeType: 'image/png',
    buffer: Buffer.from(base64, 'base64'),
  });
  await expect(panel.getByRole('status').filter({ hasText: 'کانتور؛' })).toContainText('۱ کانتور');
  await expect(
    panel.getByRole('img', { name: 'پیش‌نمایش کانتور تصویر', exact: true }).locator('path'),
  ).toHaveCount(1);
  const width = panel.getByRole('spinbutton', { name: 'عرض مرجع تصویر', exact: true });
  await width.fill('80');
  await width.press('Enter');
  for (const format of ['SVG', 'DXF']) {
    const download = page.waitForEvent('download');
    await panel.getByRole('button', { name: `دانلود ${format} ردیابی`, exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`trace_contours_W80-E0.2mm.${format.toLowerCase()}`);
    const path = await file.path();
    expect(path).not.toBeNull();
    const text = await readFile(path!, 'utf8');
    if (format === 'SVG') {
      expect(text).toContain('width="80mm"');
      expect(text).toContain('height="80mm"');
    } else {
      expect(text).toContain('AC1009');
      expect(text).toContain('LINE');
    }
  }
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  await panel
    .getByLabel('تصویر ردیابی', { exact: true })
    .setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not a png') });
  await expect(panel.getByRole('alert')).toContainText('تصویر خوانده نشد');
  await expect(
    panel.getByRole('button', { name: 'دانلود SVG ردیابی', exact: true }),
  ).toBeDisabled();
});

test('nested traced contours identify a retained island without creating a bridge or changing exports', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('ردیابی تصویر — Otsu و کانتور', { exact: true }).click();
  const panel = page.locator('.image-trace-tool');
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = 'black';
    ctx.fillRect(4, 4, 24, 24);
    ctx.fillStyle = 'white';
    ctx.fillRect(12, 12, 8, 8);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await panel.getByLabel('تصویر ردیابی', { exact: true }).setInputFiles({
    name: 'ring.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64'),
  });
  await expect(
    panel.getByRole('status').filter({ hasText: 'جزیرهٔ محصور نیازمند پل:' }),
  ).toContainText('۱');
  const paths = panel
    .getByRole('img', { name: 'پیش‌نمایش کانتور تصویر', exact: true })
    .locator('path');
  await expect(paths).toHaveCount(2);
  await expect(panel.locator('path[data-island="true"]')).toHaveCount(1);
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'دانلود SVG ردیابی', exact: true }).click();
  const path = await (await download).path();
  expect(path).not.toBeNull();
  const svg = await readFile(path!, 'utf8');
  expect((svg.match(/<path /g) ?? []).length).toBe(2);
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('a retained bridge changes traced output geometry and resets on scale changes', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('ردیابی تصویر — Otsu و کانتور', { exact: true }).click();
  const panel = page.locator('.image-trace-tool');
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = 'black';
    ctx.fillRect(4, 4, 24, 24);
    ctx.fillStyle = 'white';
    ctx.fillRect(12, 12, 8, 8);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await panel.getByLabel('تصویر ردیابی', { exact: true }).setInputFiles({
    name: 'ring.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64'),
  });
  const status = panel.getByRole('status').filter({ hasText: 'جزیرهٔ محصور نیازمند پل:' });
  await expect(status).toContainText('۱');
  const bridgeWidth = panel.getByRole('spinbutton', { name: 'عرض پل جزیره', exact: true });
  await bridgeWidth.fill('3');
  await bridgeWidth.press('Enter');
  await panel.getByRole('button', { name: 'اعمال پل به کانتور برش', exact: true }).click();
  await expect(status).toContainText('۰');
  await expect(
    panel.getByRole('img', { name: 'پیش‌نمایش کانتور تصویر', exact: true }).locator('path'),
  ).toHaveCount(1);
  await expect(
    panel.getByRole('button', { name: 'اعمال پل به کانتور برش', exact: true }),
  ).toBeDisabled();
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'دانلود SVG ردیابی', exact: true }).click();
  const path = await (await download).path();
  expect(path).not.toBeNull();
  const svg = await readFile(path!, 'utf8');
  expect((svg.match(/<path /g) ?? []).length).toBe(1);
  await panel.getByRole('button', { name: 'حذف همهٔ پل‌ها', exact: true }).click();
  await expect(status).toContainText('۱');
  await panel.getByRole('button', { name: 'اعمال پل به کانتور برش', exact: true }).click();
  await expect(status).toContainText('۰');
  const width = panel.getByRole('spinbutton', { name: 'عرض مرجع تصویر', exact: true });
  await width.fill('80');
  await width.press('Enter');
  await expect(status).toContainText('۱');
  await expect(panel.getByRole('button', { name: 'حذف همهٔ پل‌ها', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('update checking is opt-in and only offers trusted repository installer links', async ({
  page,
}) => {
  const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const futureVersion = `${Number(metadata.version.split('.')[0]) + 1}.0.0`;
  const installer = `Patturn_${futureVersion}_x64.exe`;
  let requests = 0;
  await page.route(
    'https://api.github.com/repos/pranses2011/Sahand_Patturn/releases/latest',
    async (route) => {
      requests++;
      await route.fulfill({
        json: {
          tag_name: `v${futureVersion}`,
          draft: false,
          prerelease: false,
          assets: [
            {
              name: installer,
              size: 2048,
              browser_download_url: 'https://evil.invalid/bad.exe',
            },
          ],
        },
      });
    },
  );
  await page.goto('/');
  expect(requests).toBe(0);
  await page.getByText('به‌روزرسانی — بررسی آنلاین اختیاری', { exact: true }).click();
  expect(requests).toBe(0);
  const panel = page.locator('.update-panel');
  await expect(panel.locator('bdi').first()).toHaveText(metadata.version);
  await panel.getByRole('button', { name: 'بررسی نسخهٔ جدید', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('نسخهٔ پایدار جدیدتر:');
  expect(requests).toBe(1);
  await expect(panel.getByRole('link', { name: /دریافت نصب‌کننده:/ })).toHaveAttribute(
    'href',
    `https://github.com/pranses2011/Sahand_Patturn/releases/download/v${futureVersion}/${installer}`,
  );
  await expect(
    panel.getByRole('link', { name: 'یادداشت‌های انتشار جدید', exact: true }),
  ).toHaveAttribute(
    'href',
    `https://github.com/pranses2011/Sahand_Patturn/releases/tag/v${futureVersion}`,
  );
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('failed optional update check can retry without a release or blocking local edits', async ({
  page,
}) => {
  let requests = 0;
  await page.route(
    'https://api.github.com/repos/pranses2011/Sahand_Patturn/releases/latest',
    async (route) => {
      requests++;
      if (requests === 1) await route.abort('internetdisconnected');
      else await route.fulfill({ status: 404, body: '{}' });
    },
  );
  await page.goto('/');
  await page.getByText('به‌روزرسانی — بررسی آنلاین اختیاری', { exact: true }).click();
  const panel = page.locator('.update-panel');
  await panel.getByRole('button', { name: 'بررسی نسخهٔ جدید', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('بررسی نسخه ناموفق بود');
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('7');
  await wall.press('Enter');
  await expect(wall).toHaveValue('7');
  await panel.getByRole('button', { name: 'بررسی نسخهٔ جدید', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('انتشار عمومی پایداری');
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect(wall).toHaveValue('7');
});

test('convex image stamp exports mirrored relief and invalidates on options or contour changes', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('ردیابی تصویر — Otsu و کانتور', { exact: true }).click();
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = 'black';
    ctx.fillRect(4, 4, 8, 8);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await page.getByLabel('تصویر ردیابی', { exact: true }).setInputFiles({
    name: 'square.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64'),
  });
  await page.getByText('مهرساز — برجسته‌سازی کانتور محدب', { exact: true }).click();
  const panel = page.locator('.stamp-tool');
  await expect(
    panel.getByRole('checkbox', { name: 'آینه‌سازی X برای اثر مهر', exact: true }),
  ).toBeChecked();
  await panel.getByRole('button', { name: 'ساخت مهر از کانتور فعلی', exact: true }).click();
  await expect(panel.getByRole('status').filter({ hasText: 'مهر متصل و مش معتبر' })).toBeVisible();
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'دانلود STL مهر', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('stamp_mirrored_B3-R2-W1mm.stl');
  const path = await file.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  expect(bytes.length).toBe(84 + bytes.readUInt32LE(80) * 50);
  let min = Infinity,
    max = -Infinity;
  for (let offset = 84; offset < bytes.length; offset += 50)
    for (let v = 0; v < 3; v++) {
      const z = bytes.readFloatLE(offset + 20 + v * 12);
      min = Math.min(min, z);
      max = Math.max(max, z);
    }
  expect(min).toBe(0);
  expect(max).toBe(5);
  await panel.getByRole('checkbox', { name: 'آینه‌سازی X برای اثر مهر', exact: true }).uncheck();
  await expect(panel.getByRole('button', { name: 'دانلود STL مهر', exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'ساخت مهر از کانتور فعلی', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'دانلود STL مهر', exact: true })).toBeVisible();
  const width = page.getByRole('spinbutton', { name: 'عرض مرجع تصویر', exact: true });
  await width.fill('80');
  await width.press('Enter');
  await expect(panel.getByRole('button', { name: 'دانلود STL مهر', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('Persian result formatting leaves numeric inputs and portable project values unchanged', async ({
  page,
}) => {
  await page.goto('/');
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('7');
  await wall.press('Enter');
  await expect(wall).toHaveValue('7');
  await expect(
    page.getByRole('contentinfo', { name: 'خلاصهٔ ابعاد و ظرفیت', exact: true }),
  ).toContainText('ضخامت ۷ mm');
  await expect(page.locator('.form-dimensions')).toContainText('ظرفیت تقریبی:');
  await expect(page.locator('.form-dimensions')).not.toContainText('Capacity:');
  await expect(page.locator('.form-dimensions bdi').first()).toContainText(/[۰-۹]/);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ذخیرهٔ فایل پروژه', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).not.toMatch(/[۰-۹]/);
  const path = await file.path();
  expect(path).not.toBeNull();
  const document = JSON.parse(strFromU8(gunzipSync(new Uint8Array(await readFile(path!)))));
  expect(document.state.wall).toBe(7);
  expect(typeof document.state.wall).toBe('number');
  expect(document.unit).toBe('mm');
});

test('logical flow arrow follows inherited RTL/LTR without changing project parameters', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '🧱 قالب', exact: true }).click();
  const arrow = page.locator('.flow-arrow').first();
  await expect(arrow).toBeVisible();
  await expect(arrow).toHaveAttribute('aria-hidden', 'true');
  await expect(arrow.locator('svg')).toHaveAttribute('focusable', 'false');
  expect(await arrow.evaluate((element) => getComputedStyle(element).transform)).toBe(
    'matrix(-1, 0, 0, 1, 0, 0)',
  );
  await page.evaluate(() => (document.documentElement.dir = 'ltr'));
  await expect
    .poll(() => arrow.evaluate((element) => getComputedStyle(element).transform))
    .toBe('matrix(1, 0, 0, 1, 0, 0)');
  await page.evaluate(() => (document.documentElement.dir = 'rtl'));
  expect(await arrow.evaluate((element) => getComputedStyle(element).transform)).toBe(
    'matrix(-1, 0, 0, 1, 0, 0)',
  );
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('optional tools fetch only after expansion and preserve settings while collapsed', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (request) => {
    if (/(?:ImageTraceTool|JigsawTool|ChuckTool)-.*\.js/.test(request.url()))
      requested.push(request.url());
  });
  await page.goto('/');
  expect(requested).toHaveLength(0);
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  expect(requested).toHaveLength(0);
  const summary = page.getByText('الگوی پازل — اتصال jigsaw با seed قطعی', { exact: true });
  await summary.click();
  const seed = page.getByRole('spinbutton', { name: 'seed پازل', exact: true });
  await expect(seed).toBeVisible();
  await seed.fill('123');
  await seed.press('Enter');
  await summary.click();
  await summary.click();
  await expect(seed).toHaveValue('123');
  expect(requested.filter((url) => url.includes('JigsawTool-'))).toHaveLength(1);
  expect(requested.some((url) => /ImageTraceTool-|ChuckTool-/.test(url))).toBe(false);
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('failed optional chunk stays isolated while another tool and the project remain usable', async ({
  page,
}) => {
  await page.route('**/ChuckTool-*.js', (route) => route.abort('internetdisconnected'));
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('چاک‌ساز — شیب ۲ درجه و سوراخ تخلیه', { exact: true }).click();
  await expect(page.locator('.chuck-tool').getByRole('alert')).toContainText(
    'بارگذاری ابزار ناموفق بود',
  );
  await page.getByText('الگوی پازل — اتصال jigsaw با seed قطعی', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'دانلود SVG پازل', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('rib tool derives a live 2D cavity profile and exports mm templates without project edits', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('ریب‌ساز — الگوی دوبعدی پروفیل داخلی', { exact: true }).click();
  const preview = page.getByRole('img', { name: 'پیش‌نمایش ریب پروفیل', exact: true });
  await expect(preview.locator('path')).toHaveCount(1);
  const before = await preview.locator('path').getAttribute('d');
  const backing = page.getByRole('spinbutton', { name: 'عرض پشت ریب', exact: true });
  await backing.fill('30');
  await backing.press('Enter');
  await expect(preview.locator('path')).not.toHaveAttribute('d', before!);
  for (const format of ['SVG', 'DXF']) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: `دانلود ${format} ریب`, exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`rib_sampled-profile_back30mm.${format.toLowerCase()}`);
    const text = await readFile((await file.path())!, 'utf8');
    expect(text).toContain(format === 'SVG' ? 'mm"' : 'AC1009');
  }
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  await page.getByText('ریب‌ساز — الگوی دوبعدی پروفیل داخلی', { exact: true }).click();
  await page.getByText('ریب‌ساز — الگوی دوبعدی پروفیل داخلی', { exact: true }).click();
  await expect(backing).toHaveValue('30');
});

test('rib solid exports validated thickness in binary STL and refreshes with the cavity', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('ریب‌ساز — الگوی دوبعدی پروفیل داخلی', { exact: true }).click();
  const preview = page.getByRole('img', { name: 'پیش‌نمایش ریب پروفیل', exact: true });
  const before = await preview.locator('path').getAttribute('d');
  const thickness = page.getByRole('spinbutton', { name: 'ضخامت ریب', exact: true });
  await thickness.fill('6');
  await thickness.press('Enter');
  await expect(
    page.getByRole('img', { name: 'نمای ضخامت ریب', exact: true }).locator('rect'),
  ).toHaveAttribute('width', '6');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'دانلود STL ریب', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('rib_solid_back20-T6mm.stl');
  const bytes = await readFile((await file.path())!);
  const count = bytes.readUInt32LE(80);
  expect(bytes.length).toBe(84 + 50 * count);
  expect(count).toBeGreaterThan(100);
  let minZ = Infinity,
    maxZ = -Infinity;
  for (let t = 0; t < count; t++)
    for (let v = 0; v < 3; v++) {
      const z = bytes.readFloatLE(84 + t * 50 + 12 + v * 12 + 8);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  expect(minZ).toBe(0);
  expect(maxZ).toBe(6);
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  await page.getByRole('button', { name: '🏺 فرم', exact: true }).click();
  const wall = page
    .locator('.ctl')
    .filter({ hasText: 'ضخامت شعاعی برای ظرفیت' })
    .locator('input.num');
  await wall.fill('6');
  await wall.press('Enter');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('ریب‌ساز — الگوی دوبعدی پروفیل داخلی', { exact: true }).click();
  await expect(preview.locator('path')).not.toHaveAttribute('d', before!);
});

test('rib PDF loads offline font on demand, cancels safely and retries with actual A4 pages', async ({
  page,
}) => {
  let releaseFont!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseFont = resolve;
  });
  let fontRequested!: () => void;
  const fontSeen = new Promise<void>((resolve) => {
    fontRequested = resolve;
  });
  let first = true;
  await page.route('**/*vazirmatn*.js', async (route) => {
    if (first) {
      first = false;
      fontRequested();
      await gate;
    }
    await route.continue();
  });
  const downloads: string[] = [];
  page.on('download', (file) => downloads.push(file.suggestedFilename()));
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('ریب‌ساز — الگوی دوبعدی پروفیل داخلی', { exact: true }).click();
  const button = page.getByRole('button', { name: 'دانلود PDF ریب', exact: true });
  await button.click();
  await fontSeen;
  await page.getByRole('button', { name: 'لغو PDF ریب', exact: true }).click();
  releaseFont();
  await expect(page.getByRole('alert').filter({ hasText: 'ساخت PDF ریب لغو شد' })).toBeVisible();
  expect(downloads).toEqual([]);
  await expect(button).toBeEnabled();
  const pending = page.waitForEvent('download');
  await button.click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe('rib_template_A4-1to1.pdf');
  const pdf = await readFile((await file.path())!, 'latin1');
  expect(pdf.startsWith('%PDF-')).toBe(true);
  expect(pdf).toContain('/FontFile2');
  expect(pdf).toContain('/MediaBox [0 0 595.28 841.89]');
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('changing rib settings while PDF imports are pending suppresses the old download', async ({
  page,
}) => {
  let releaseFont!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseFont = resolve;
  });
  let seen!: () => void;
  const requested = new Promise<void>((resolve) => {
    seen = resolve;
  });
  await page.route('**/*vazirmatn*.js', async (route) => {
    seen();
    await gate;
    await route.continue();
  });
  const downloads: string[] = [];
  page.on('download', (file) => downloads.push(file.suggestedFilename()));
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('ریب‌ساز — الگوی دوبعدی پروفیل داخلی', { exact: true }).click();
  const pdfButton = page.getByRole('button', { name: 'دانلود PDF ریب', exact: true });
  await pdfButton.click();
  await requested;
  const backing = page.getByRole('spinbutton', { name: 'عرض پشت ریب', exact: true });
  await backing.fill('30');
  await backing.press('Enter');
  await expect(pdfButton).toBeEnabled();
  releaseFont();
  // A fresh request waits for the same module graph; its download proves old work settled.
  const pending = page.waitForEvent('download');
  await pdfButton.click();
  await pending;
  await expect(pdfButton).toBeEnabled();
  expect(downloads).toEqual(['rib_template_A4-1to1.pdf']);
});

// Actual SQLite behind a synthetic Tauri IPC bridge: not an installed-Windows test.
const desktopLegacy = JSON.stringify({
  version: 1,
  entries: [
    {
      id: 'desktop-original',
      savedAt: '2026-01-01T00:00:00.000Z',
      state: {
        profileMode: 'reference',
        segments: 96,
        wall: 4,
        shrink: 12,
        fill: 80,
        patternId: 'dot-grid',
        tileSize: 40,
      },
    },
  ],
});
async function installSqlBridge(
  page: import('@playwright/test').Page,
  database: DatabaseSync,
  before?: (command: string, query: string) => Promise<void>,
) {
  await page.exposeFunction(
    'testSqlInvoke',
    async (command: string, args: { query?: string; values?: unknown[] }) => {
      await before?.(command, args.query ?? '');
      if (command === 'plugin:sql|load') return 'sqlite:patturn.db';
      if (command === 'plugin:sql|execute') {
        const result = database.prepare(args.query!).run(...(args.values as SQLInputValue[]));
        return [Number(result.changes), Number(result.lastInsertRowid)];
      }
      if (command === 'plugin:sql|select')
        return database.prepare(args.query!).all(...(args.values as SQLInputValue[]));
      throw Error('Unsupported synthetic native command');
    },
  );
  await page.addInitScript((raw) => {
    const target = window as unknown as {
      isTauri: boolean;
      __TAURI_INTERNALS__: unknown;
      testSqlInvoke: (command: string, args: unknown) => Promise<unknown>;
    };
    target.isTauri = true;
    target.__TAURI_INTERNALS__ = {
      invoke: (command: string, args: unknown) => target.testSqlInvoke(command, args),
    };
    if (localStorage.getItem('patturn:editor-history:v1') === null)
      localStorage.setItem('patturn:editor-history:v1', raw);
  }, desktopLegacy);
}
function sqlEntries(database: DatabaseSync) {
  return JSON.parse(
    database.prepare('select document from patturn_editor_history').get()!.document as string,
  ).entries as { id: string; state: { wall: number } }[];
}
test('desktop bridge uses actual SQLite for migration, autosave, reload and historical restore', async ({
  page,
}) => {
  const database = new DatabaseSync(':memory:');
  try {
    await installSqlBridge(page, database);
    await page.goto('/');
    const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
    await expect(wall).toHaveValue('4');
    expect(sqlEntries(database)[0]!.id).toBe('desktop-original');
    await wall.fill('6');
    await wall.press('Enter');
    await expect.poll(() => sqlEntries(database)[0]!.state.wall).toBe(6);
    await page.reload();
    await expect(wall).toHaveValue('6');
    expect(await page.evaluate(() => localStorage.getItem('patturn:editor-history:v1'))).toBe(
      desktopLegacy,
    );
    await page.locator('.history-panel').first().locator('summary').click();
    await expect(page.locator('.history-panel').first()).toContainText('SQLite');
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('.history-entry').nth(1).getByRole('button').click();
    await expect(wall).toHaveValue('4');
    await expect.poll(() => sqlEntries(database)[0]!.state.wall).toBe(4);
    expect(sqlEntries(database)[1]!.state.wall).toBe(6);
  } finally {
    await page.close();
    database.close();
  }
});
test('desktop SQL startup failure blocks autosave, retries explicitly and preserves corrupt data', async ({
  page,
}) => {
  const database = new DatabaseSync(':memory:');
  let fail = true;
  try {
    await installSqlBridge(page, database, async (command) => {
      if (fail && command === 'plugin:sql|load') throw Error('database locked');
    });
    await page.goto('/');
    await expect(
      page.getByRole('alert').filter({ hasText: 'تاریخچهٔ SQLite دسکتاپ' }),
    ).toBeVisible();
    await expect(page.getByRole('spinbutton')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('patturn:editor-history:v1'))).toBe(
      desktopLegacy,
    );
    fail = false;
    await page
      .getByRole('button', { name: 'تلاش دوباره برای تاریخچهٔ دسکتاپ', exact: true })
      .click();
    await expect(
      page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true }),
    ).toHaveValue('4');
    database.prepare("update patturn_editor_history set document='broken'").run();
    await page.reload();
    await expect(
      page.getByRole('alert').filter({ hasText: 'تاریخچهٔ SQLite دسکتاپ' }),
    ).toBeVisible();
    expect(database.prepare('select document from patturn_editor_history').get()!.document).toBe(
      'broken',
    );
  } finally {
    await page.close();
    database.close();
  }
});
test('desktop async save does not acknowledge newer edits when an old SQL write finishes', async ({
  page,
}) => {
  const database = new DatabaseSync(':memory:');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let seen!: () => void;
  const waiting = new Promise<void>((resolve) => {
    seen = resolve;
  });
  let held = false;
  try {
    await installSqlBridge(page, database, async (command, query) => {
      if (command === 'plugin:sql|select' && query.startsWith('update') && !held) {
        held = true;
        seen();
        await gate;
      }
    });
    await page.goto('/');
    const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
    await wall.fill('5');
    await wall.press('Enter');
    await waiting;
    await wall.fill('6');
    await wall.press('Enter');
    release();
    await expect.poll(() => sqlEntries(database)[0]!.state.wall).toBe(5);
    await expect(page.locator('header')).not.toContainText('✓ ذخیره شد');
    await expect.poll(() => sqlEntries(database)[0]!.state.wall, { timeout: 10000 }).toBe(6);
    await expect(page.locator('header')).toContainText('✓ ذخیره شد');
  } finally {
    release();
    await page.close();
    database.close();
  }
});

test('desktop SQL write failure preserves history without browser fallback and explicit retry saves', async ({
  page,
}) => {
  const database = new DatabaseSync(':memory:');
  let deny = false;
  try {
    await installSqlBridge(page, database, async (command, query) => {
      if (deny && command === 'plugin:sql|select' && query.startsWith('update'))
        throw Error('synthetic disk full');
    });
    await page.goto('/');
    const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
    await expect(wall).toHaveValue('4');
    deny = true;
    await wall.fill('6');
    await wall.press('Enter');
    const error = page.getByRole('alert').filter({ hasText: /^ذخیرهٔ محلی ناموفق بود/ });
    await expect(error).toBeVisible({ timeout: 10000 });
    expect(sqlEntries(database)[0]!.state.wall).toBe(4);
    expect(await page.evaluate(() => localStorage.getItem('patturn:editor-history:v1'))).toBe(
      desktopLegacy,
    );
    await expect(page.locator('header')).not.toContainText('✓ ذخیره شد');
    deny = false;
    await error.getByRole('button', { name: 'تلاش دوباره', exact: true }).click();
    await expect(error).toHaveCount(0);
    expect(sqlEntries(database)[0]!.state.wall).toBe(6);
  } finally {
    await page.close();
    database.close();
  }
});

test('extruder manual circular die exports closed templates and STL while blocking thin web', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('دای اکسترودر — سوراخ گرد و قطر دستی', { exact: true }).click();
  const preview = page.getByRole('img', { name: 'پیش‌نمایش دای اکسترودر', exact: true });
  await expect(preview.locator('path')).toHaveCount(7);
  for (const format of ['SVG', 'DXF', 'STL']) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: `دانلود ${format} دای`, exact: true }).click();
    const file = await pending;
    expect(file.suggestedFilename()).toBe(
      `extruder_round-holes_D60-T8-H8-N6-R16mm.${format.toLowerCase()}`,
    );
    const bytes = await readFile((await file.path())!);
    if (format === 'STL') {
      expect(bytes.length).toBe(84 + 50 * bytes.readUInt32LE(80));
      let min = Infinity,
        max = -Infinity;
      for (let i = 0; i < bytes.readUInt32LE(80); i++)
        for (let v = 0; v < 3; v++) {
          const z = bytes.readFloatLE(84 + i * 50 + 12 + v * 12 + 8);
          min = Math.min(min, z);
          max = Math.max(max, z);
        }
      expect(min).toBe(0);
      expect(max).toBe(8);
    } else expect(bytes.toString()).toContain(format === 'SVG' ? 'mm"' : 'AC1009');
  }
  const count = page.getByRole('spinbutton', { name: 'تعداد سوراخ دای', exact: true });
  await count.fill('12');
  await count.press('Enter');
  await expect(
    page.getByRole('alert').filter({ hasText: 'ابعاد یا آرایش دای معتبر نیست' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'دانلود STL دای', exact: true })).toHaveCount(0);
  const hole = page.getByRole('spinbutton', { name: 'قطر سوراخ دای', exact: true });
  await hole.fill('4');
  await hole.press('Enter');
  await expect(preview.locator('path')).toHaveCount(13);
  await page.getByText('دای اکسترودر — سوراخ گرد و قطر دستی', { exact: true }).click();
  await page.getByText('دای اکسترودر — سوراخ گرد و قطر دستی', { exact: true }).click();
  await expect(count).toHaveValue('12');
  await expect(hole).toHaveValue('4');
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});
test('extruder WASM failure leaves drawing exports available and explicit retry recovers', async ({
  page,
}) => {
  let allow = false;
  await page.route('**/*.wasm', async (route) => {
    if (allow) await route.continue();
    else await route.abort('failed');
  });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('دای اکسترودر — سوراخ گرد و قطر دستی', { exact: true }).click();
  const stl = page.getByRole('button', { name: 'دانلود STL دای', exact: true });
  await stl.click();
  await expect(page.getByRole('alert').filter({ hasText: 'STL دای ساخته نشد' })).toBeVisible();
  const svg = page.waitForEvent('download');
  await page.getByRole('button', { name: 'دانلود SVG دای', exact: true }).click();
  await svg;
  allow = true;
  const download = page.waitForEvent('download');
  await stl.click();
  await download;
  await expect(page.getByRole('alert').filter({ hasText: 'STL دای ساخته نشد' })).toHaveCount(0);
});

test('extruder optional collar fuses into STL while the 2D cutting template stays unchanged', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('دای اکسترودر — سوراخ گرد و قطر دستی', { exact: true }).click();
  const plainDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'دانلود SVG دای', exact: true }).click();
  const plain = await readFile((await (await plainDownload).path())!, 'utf8');
  await page.getByRole('checkbox', { name: 'فلنج نگه‌دارندهٔ اختیاری STL', exact: true }).check();
  const width = page.getByRole('spinbutton', { name: 'عرض شعاعی فلنج دای', exact: true });
  await width.fill('6');
  await width.press('Enter');
  await expect(
    page.getByRole('img', { name: 'پیش‌نمایش دای اکسترودر', exact: true }).locator('circle'),
  ).toHaveAttribute('r', '36');
  await expect(page.locator('.extruder-tool')).toContainText(
    'فلنج و شانه در SVG/DXF صادر نمی‌شوند',
  );
  const sameDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'دانلود SVG دای', exact: true }).click();
  expect(await readFile((await (await sameDownload).path())!, 'utf8')).toBe(plain);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'دانلود STL دای', exact: true }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe('extruder_round-holes_D60-T8-H8-N6-R16-F6x4mm.stl');
  const bytes = await readFile((await file.path())!);
  const count = bytes.readUInt32LE(80);
  expect(bytes.length).toBe(84 + 50 * count);
  let topRadius = 0,
    collarRadius = 0,
    minZ = Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < count; i++)
    for (let v = 0; v < 3; v++) {
      const offset = 84 + i * 50 + 12 + v * 12;
      const x = bytes.readFloatLE(offset),
        y = bytes.readFloatLE(offset + 4),
        z = bytes.readFloatLE(offset + 8);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
      if (Math.abs(z - 12) < 1e-5) topRadius = Math.max(topRadius, Math.hypot(x, y));
      if (Math.abs(z - 4) < 1e-5) collarRadius = Math.max(collarRadius, Math.hypot(x, y));
    }
  expect(minZ).toBe(0);
  expect(maxZ).toBe(12);
  expect(topRadius).toBeCloseTo(30, 4);
  expect(collarRadius).toBeCloseTo(36, 4);
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('named projects save current parameters, duplicate, reopen and delete in browser storage', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('مدیریت پروژه‌ها — ذخیره با نام و بازکردن', { exact: true }).click();
  const manager = page.locator('.project-manager');
  await manager.getByRole('textbox', { name: 'نام پروژهٔ جدید', exact: true }).fill('طرح اول');
  await manager.getByRole('button', { name: 'ذخیرهٔ وضعیت فعلی با نام', exact: true }).click();
  await expect(manager.getByRole('button', { name: 'بازکردن طرح اول', exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept('نسخهٔ کپی'));
  await manager.getByRole('button', { name: 'تکثیر طرح اول', exact: true }).click();
  await expect(
    manager.getByRole('button', { name: 'بازکردن نسخهٔ کپی', exact: true }),
  ).toBeVisible();
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('6');
  await wall.press('Enter');
  page.once('dialog', (dialog) => dialog.accept());
  await manager.getByRole('button', { name: 'بازکردن طرح اول', exact: true }).click();
  await expect(wall).toHaveValue('4');
  page.once('dialog', (dialog) => dialog.accept());
  await manager.getByRole('button', { name: 'حذف نسخهٔ کپی', exact: true }).click();
  await expect(manager.getByRole('button', { name: 'بازکردن نسخهٔ کپی', exact: true })).toHaveCount(
    0,
  );
  await page.reload();
  await page.getByText('مدیریت پروژه‌ها — ذخیره با نام و بازکردن', { exact: true }).click();
  await expect(manager.getByRole('button', { name: 'بازکردن طرح اول', exact: true })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('patturn:projects')!));
  expect(stored).toHaveLength(1);
  expect(stored[0].data.form.wallThickness).toBe(4);
});
test('named project library preserves corrupt data and rejects unsupported documents without changing the editor', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('patturn:projects', 'broken'));
  await page.goto('/');
  await page.getByText('مدیریت پروژه‌ها — ذخیره با نام و بازکردن', { exact: true }).click();
  const manager = page.locator('.project-manager');
  await expect(manager.getByRole('alert')).toContainText('فهرست پروژه‌ها خوانده نشد');
  await expect(
    manager.getByRole('button', { name: 'ذخیرهٔ وضعیت فعلی با نام', exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('patturn:projects'))).toBe('broken');
  await page.evaluate(() => {
    const time = '2020-01-01T00:00:00.000Z';
    localStorage.setItem(
      'patturn:projects',
      JSON.stringify([
        {
          id: 'generic',
          name: 'عمومی',
          schemaVersion: 3,
          createdAt: time,
          updatedAt: time,
          data: {
            schemaVersion: 3,
            name: 'عمومی',
            createdAt: time,
            updatedAt: time,
            settings: { unit: 'mm', shrink: 0.12, wallThickness: 4 },
          },
        },
      ]),
    );
  });
  await manager.getByRole('button', { name: 'بازخوانی فهرست پروژه‌ها', exact: true }).click();
  await manager.getByRole('button', { name: 'بازکردن عمومی', exact: true }).click();
  await expect(manager.getByRole('alert')).toContainText('پشتیبانی‌نشده');
  await expect(
    page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true }),
  ).toHaveValue('4');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('patturn:projects')!)[0].id),
  ).toBe('generic');
});
test('desktop named projects use actual SQLite independently of editor history and browser library', async ({
  page,
}) => {
  const database = new DatabaseSync(':memory:');
  try {
    await installSqlBridge(page, database);
    await page.goto('/');
    await page.getByText('مدیریت پروژه‌ها — ذخیره با نام و بازکردن', { exact: true }).click();
    const manager = page.locator('.project-manager');
    await manager.getByRole('textbox', { name: 'نام پروژهٔ جدید', exact: true }).fill('پروژهٔ SQL');
    await manager.getByRole('button', { name: 'ذخیرهٔ وضعیت فعلی با نام', exact: true }).click();
    await expect(
      manager.getByRole('button', { name: 'بازکردن پروژهٔ SQL', exact: true }),
    ).toBeVisible();
    expect(database.prepare('select count(*) as n from patturn_projects').get()!.n).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('patturn:projects'))).toBeNull();
    await page.reload();
    await page.getByText('مدیریت پروژه‌ها — ذخیره با نام و بازکردن', { exact: true }).click();
    await expect(
      manager.getByRole('button', { name: 'بازکردن پروژهٔ SQL', exact: true }),
    ).toBeVisible();
  } finally {
    await page.close();
    database.close();
  }
});

test('desktop explicit project import preserves browser source and copies the complete library only once', async ({
  page,
}) => {
  const database = new DatabaseSync(':memory:');
  try {
    await installSqlBridge(page, database);
    await page.goto('/');
    const source = await page.evaluate(() => {
      const time = '2020-01-01T00:00:00.000Z';
      const records = ['first', 'second'].map((id) => ({
        id,
        name: id,
        schemaVersion: 3,
        createdAt: time,
        updatedAt: time,
        data: {
          schemaVersion: 3,
          name: id,
          createdAt: time,
          updatedAt: time,
          settings: { unit: 'mm', shrink: 0.12, wallThickness: 4 },
        },
      }));
      const raw = JSON.stringify(records);
      localStorage.setItem('patturn:projects', raw);
      return raw;
    });
    await page.getByText('مدیریت پروژه‌ها — ذخیره با نام و بازکردن', { exact: true }).click();
    const manager = page.locator('.project-manager');
    const action = manager.getByRole('button', {
      name: 'کپی پروژه‌های مرورگر به SQLite خالی',
      exact: true,
    });
    await expect(action).toBeEnabled();
    page.once('dialog', (dialog) => dialog.dismiss());
    await action.click();
    expect(database.prepare('select count(*) as n from patturn_projects').get()!.n).toBe(0);
    page.once('dialog', (dialog) => dialog.accept());
    await action.click();
    await expect(manager.getByRole('button', { name: 'بازکردن first', exact: true })).toBeVisible();
    await expect(
      manager.getByRole('button', { name: 'بازکردن second', exact: true }),
    ).toBeVisible();
    await expect(action).toBeDisabled();
    expect(await page.evaluate(() => localStorage.getItem('patturn:projects'))).toBe(source);
    expect(database.prepare('select count(*) as n from patturn_projects').get()!.n).toBe(2);
    await page.reload();
    await page.getByText('مدیریت پروژه‌ها — ذخیره با نام و بازکردن', { exact: true }).click();
    await expect(action).toBeDisabled();
    await expect(manager.getByRole('button', { name: 'بازکردن first', exact: true })).toBeVisible();
  } finally {
    await page.close();
    database.close();
  }
});

test('named project archive exports and imports losslessly without applying it to the editor', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('مدیریت پروژه‌ها — ذخیره با نام و بازکردن', { exact: true }).click();
  const manager = page.locator('.project-manager');
  await manager.getByRole('textbox', { name: 'نام پروژهٔ جدید', exact: true }).fill('فایل مستقل');
  await manager.getByRole('button', { name: 'ذخیرهٔ وضعیت فعلی با نام', exact: true }).click();
  // Saving is asynchronous; a click resolving does not mean persistence completed.
  await expect(
    manager.getByRole('button', { name: 'بازکردن فایل مستقل', exact: true }),
  ).toBeVisible();
  const original = await page.evaluate(
    () => JSON.parse(localStorage.getItem('patturn:projects')!)[0],
  );
  const download = page.waitForEvent('download');
  await manager.getByRole('button', { name: 'خروجی فایل فایل مستقل', exact: true }).click();
  const archive = await readFile((await (await download).path())!);
  expect(JSON.parse(archive.toString()).project).toEqual(original);
  page.once('dialog', (dialog) => dialog.accept());
  await manager.getByRole('button', { name: 'حذف فایل مستقل', exact: true }).click();
  const input = manager.getByLabel('ورود فایل پروژهٔ نام‌دار', { exact: true });
  await expect(input).toBeEnabled();
  const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await wall.fill('6');
  await wall.press('Enter');
  page.once('dialog', (dialog) => dialog.dismiss());
  await input.setInputFiles({
    name: 'named-project.patturn',
    mimeType: 'application/json',
    buffer: archive,
  });
  await expect(
    manager.getByRole('button', { name: 'بازکردن فایل مستقل', exact: true }),
  ).toHaveCount(0);
  page.once('dialog', (dialog) => dialog.accept());
  await input.setInputFiles({
    name: 'named-project.patturn',
    mimeType: 'application/json',
    buffer: archive,
  });
  await expect(
    manager.getByRole('button', { name: 'بازکردن فایل مستقل', exact: true }),
  ).toBeVisible();
  await expect(input).toBeEnabled();
  await expect(wall).toHaveValue('6');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('patturn:projects')!)[0]),
  ).toEqual(original);
});

test('named archive rejects corrupt and oversized files, then imports a valid general document into SQLite', async ({
  page,
}) => {
  const database = new DatabaseSync(':memory:');
  try {
    await installSqlBridge(page, database);
    await page.goto('/');
    await page.getByText('مدیریت پروژه‌ها — ذخیره با نام و بازکردن', { exact: true }).click();
    const manager = page.locator('.project-manager');
    const input = manager.getByLabel('ورود فایل پروژهٔ نام‌دار', { exact: true });
    for (const buffer of [Buffer.from('{broken'), Buffer.alloc(2 * 1024 * 1024 + 1, 32)]) {
      await expect(input).toBeEnabled();
      await input.setInputFiles({ name: 'bad.patturn', mimeType: 'application/json', buffer });
      await expect(manager.getByRole('alert')).toContainText('عملیات پروژه انجام نشد');
      expect(database.prepare('select count(*) as n from patturn_projects').get()!.n).toBe(0);
    }
    await expect(input).toBeEnabled();
    const time = '2020-01-01T00:00:00.000Z';
    const record = {
      id: 'external',
      name: 'عمومی خارجی',
      schemaVersion: 3,
      createdAt: time,
      updatedAt: time,
      data: {
        schemaVersion: 3,
        name: 'عمومی خارجی',
        createdAt: time,
        updatedAt: time,
        settings: { unit: 'mm', shrink: 0.12, wallThickness: 4 },
      },
    };
    page.once('dialog', (dialog) => dialog.accept());
    await input.setInputFiles({
      name: 'external.patturn',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ format: 'patturn', v: 1, project: record })),
    });
    await expect(
      manager.getByRole('button', { name: 'بازکردن عمومی خارجی', exact: true }),
    ).toBeVisible();
    expect(
      JSON.parse(
        database.prepare('select document from patturn_projects').get()!.document as string,
      ),
    ).toEqual(record);
    expect(await page.evaluate(() => localStorage.getItem('patturn:projects'))).toBeNull();
    page.once('dialog', (dialog) => dialog.accept());
    await input.setInputFiles({
      name: 'again.patturn',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ format: 'patturn', v: 1, project: record })),
    });
    await expect(
      manager.getByRole('button', { name: 'بازکردن عمومی خارجی', exact: true }),
    ).toHaveCount(2);
    const importedRows = database
      .prepare('select document from patturn_projects')
      .all()
      .map((row) => JSON.parse(row.document as string));
    expect(importedRows.find((row) => row.id === 'external')).toEqual(record);
    expect(new Set(importedRows.map((row) => row.id)).size).toBe(2);
  } finally {
    await page.close();
    database.close();
  }
});

test('archive import into a nonempty library creates a new identity and never replaces a matching project', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('مدیریت پروژه‌ها — ذخیره با نام و بازکردن', { exact: true }).click();
  const manager = page.locator('.project-manager');
  await manager.getByRole('textbox', { name: 'نام پروژهٔ جدید', exact: true }).fill('اصلی');
  await manager.getByRole('button', { name: 'ذخیرهٔ وضعیت فعلی با نام', exact: true }).click();
  await expect(manager.getByRole('button', { name: 'بازکردن اصلی', exact: true })).toBeVisible();
  const original = await page.evaluate(
    () => JSON.parse(localStorage.getItem('patturn:projects')!)[0],
  );
  const imported = { ...original, name: 'واردشده', data: { ...original.data, name: 'واردشده' } };
  const input = manager.getByLabel('ورود فایل پروژهٔ نام‌دار', { exact: true });
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('کپی با شناسه');
    await dialog.accept();
  });
  await input.setInputFiles({
    name: 'copy.patturn',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'patturn', v: 1, project: imported })),
  });
  await expect(manager.getByRole('button', { name: 'بازکردن واردشده', exact: true })).toBeVisible();
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem('patturn:projects')!));
  expect(records).toHaveLength(2);
  expect(records.find((r: { id: string }) => r.id === original.id)).toEqual(original);
  expect(records.find((r: { name: string }) => r.name === 'واردشده').id).not.toBe(original.id);
  await page.reload();
  await page.getByText('مدیریت پروژه‌ها — ذخیره با نام و بازکردن', { exact: true }).click();
  await expect(manager.getByRole('button', { name: 'بازکردن اصلی', exact: true })).toBeVisible();
  await expect(manager.getByRole('button', { name: 'بازکردن واردشده', exact: true })).toBeVisible();
});

for (const desktop of [false, true]) {
  test(`opened named project saves conditionally and preserves competing changes (${desktop ? 'SQLite' : 'browser'})`, async ({
    page,
  }) => {
    const database = new DatabaseSync(':memory:');
    try {
      if (desktop) await installSqlBridge(page, database);
      await page.goto('/');
      await page.getByText('مدیریت پروژه‌ها — ذخیره با نام و بازکردن', { exact: true }).click();
      const manager = page.locator('.project-manager');
      await manager.getByRole('textbox', { name: 'نام پروژهٔ جدید', exact: true }).fill('ویرایش');
      await manager.getByRole('button', { name: 'ذخیرهٔ وضعیت فعلی با نام', exact: true }).click();
      const open = manager.getByRole('button', { name: 'بازکردن ویرایش', exact: true });
      await expect(open).toBeVisible();
      page.once('dialog', (dialog) => dialog.accept());
      await open.click();
      const save = manager.getByRole('button', {
        name: 'ذخیرهٔ تغییرات در پروژهٔ بازشده',
        exact: true,
      });
      await expect(save).toBeVisible();
      const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
      await wall.fill('6');
      await wall.press('Enter');
      page.once('dialog', (dialog) => dialog.dismiss());
      await save.click();
      const getRecord = async () =>
        desktop
          ? JSON.parse(
              database.prepare('select document from patturn_projects').get()!.document as string,
            )
          : await page.evaluate(() => JSON.parse(localStorage.getItem('patturn:projects')!)[0]);
      expect((await getRecord()).data.form.wallThickness).toBe(4);
      page.once('dialog', (dialog) => dialog.accept());
      await save.click();
      await expect(manager.getByRole('status').filter({ hasText: '۱ پروژه' })).toBeVisible();
      const updated = await getRecord();
      expect(updated.data.form.wallThickness).toBe(6);
      const competitor = {
        ...updated,
        name: 'نسخهٔ رقیب',
        data: { ...updated.data, name: 'نسخهٔ رقیب' },
      };
      if (desktop)
        database
          .prepare('update patturn_projects set document = ? where id = ?')
          .run(JSON.stringify(competitor), updated.id);
      else
        await page.evaluate(
          (record) => localStorage.setItem('patturn:projects', JSON.stringify([record])),
          competitor,
        );
      await wall.fill('7');
      await wall.press('Enter');
      page.once('dialog', (dialog) => dialog.accept());
      await save.click();
      await expect(manager.getByRole('alert')).toContainText('تعارض ذخیره');
      expect(await getRecord()).toEqual(competitor);
      await expect(wall).toHaveValue('7');
      await manager
        .getByRole('button', { name: 'پایان ارتباط با پروژهٔ نام‌دار', exact: true })
        .click();
      await expect(save).toHaveCount(0);
    } finally {
      await page.close();
      database.close();
    }
  });
}

for (const desktop of [false, true]) {
  test(`named autosave is opt-in, debounced, stops on conflict and disconnects (${desktop ? 'SQLite' : 'browser'})`, async ({
    page,
  }) => {
    const database = new DatabaseSync(':memory:');
    try {
      if (desktop) await installSqlBridge(page, database);
      await page.goto('/');
      await page.getByText('مدیریت پروژه‌ها — ذخیره با نام و بازکردن', { exact: true }).click();
      const manager = page.locator('.project-manager');
      await manager.getByRole('textbox', { name: 'نام پروژهٔ جدید', exact: true }).fill('خودکار');
      await manager.getByRole('button', { name: 'ذخیرهٔ وضعیت فعلی با نام', exact: true }).click();
      page.once('dialog', (dialog) => dialog.accept());
      await manager.getByRole('button', { name: 'بازکردن خودکار', exact: true }).click();
      const toggle = manager.getByRole('checkbox', {
        name: 'ذخیرهٔ خودکار پروژهٔ بازشده پس از ۲ ثانیه مکث',
        exact: true,
      });
      await expect(toggle).not.toBeChecked();
      await page.clock.install();
      const read = async () =>
        desktop
          ? JSON.parse(
              database.prepare('select document from patturn_projects').get()!.document as string,
            )
          : await page.evaluate(() => JSON.parse(localStorage.getItem('patturn:projects')!)[0]);
      const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
      await wall.fill('5');
      await wall.press('Enter');
      await page.clock.fastForward(3000);
      expect((await read()).data.form.wallThickness).toBe(4);
      await toggle.check();
      await page.clock.fastForward(1000);
      await wall.fill('6');
      await wall.press('Enter');
      await page.clock.fastForward(1500);
      expect((await read()).data.form.wallThickness).toBe(4);
      await page.clock.fastForward(600);
      await expect.poll(async () => (await read()).data.form.wallThickness).toBe(6);
      await expect(
        manager.getByText('پارامترها با نسخهٔ ذخیره‌شدهٔ پروژهٔ بازشده یکسان‌اند.', { exact: true }),
      ).toBeVisible();
      const saved = await read();
      const competitor = { ...saved, name: 'رقیب', data: { ...saved.data, name: 'رقیب' } };
      if (desktop)
        database
          .prepare('update patturn_projects set document = ? where id = ?')
          .run(JSON.stringify(competitor), saved.id);
      else
        await page.evaluate(
          (record) => localStorage.setItem('patturn:projects', JSON.stringify([record])),
          competitor,
        );
      await wall.fill('7');
      await wall.press('Enter');
      await page.clock.fastForward(2100);
      await expect(manager.getByRole('alert')).toContainText('تعارض ذخیره');
      await expect(toggle).not.toBeChecked();
      await wall.fill('8');
      await wall.press('Enter');
      await page.clock.fastForward(5000);
      expect(await read()).toEqual(competitor);
      await expect(wall).toHaveValue('8');
      await manager
        .getByRole('button', { name: 'پایان ارتباط با پروژهٔ نام‌دار', exact: true })
        .click();
      await expect(toggle).toHaveCount(0);
    } finally {
      await page.close();
      database.close();
    }
  });
}

test('named autosave keeps newer edits pending during an old SQL write and stops after a driver failure', async ({
  page,
}) => {
  const database = new DatabaseSync(':memory:');
  let release = () => {};
  let block = true;
  let fail = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reached = () => {};
  const requested = new Promise<void>((resolve) => {
    reached = resolve;
  });
  try {
    await installSqlBridge(page, database, async (_command, query) => {
      if (!query.startsWith('update "patturn_projects"')) return;
      if (fail) throw Error('synthetic write failure');
      if (block) {
        block = false;
        reached();
        await gate;
      }
    });
    await page.goto('/');
    await page.getByText('مدیریت پروژه‌ها — ذخیره با نام و بازکردن', { exact: true }).click();
    const manager = page.locator('.project-manager');
    await manager.getByRole('textbox', { name: 'نام پروژهٔ جدید', exact: true }).fill('دیررس');
    await manager.getByRole('button', { name: 'ذخیرهٔ وضعیت فعلی با نام', exact: true }).click();
    page.once('dialog', (dialog) => dialog.accept());
    await manager.getByRole('button', { name: 'بازکردن دیررس', exact: true }).click();
    const toggle = manager.getByRole('checkbox', {
      name: 'ذخیرهٔ خودکار پروژهٔ بازشده پس از ۲ ثانیه مکث',
      exact: true,
    });
    await toggle.check();
    await page.clock.install();
    const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
    await wall.fill('6');
    await wall.press('Enter');
    await page.clock.fastForward(2100);
    await requested;
    await wall.fill('7');
    await wall.press('Enter');
    release();
    await expect(
      manager.getByText('تغییرات پروژهٔ نام‌دار هنوز ذخیره نشده‌اند.', { exact: true }),
    ).toBeVisible();
    const thickness = () =>
      JSON.parse(
        database.prepare('select document from patturn_projects').get()!.document as string,
      ).data.form.wallThickness;
    await expect.poll(thickness).toBe(6);
    await expect(toggle).toBeEnabled();
    await page.clock.fastForward(2100);
    await expect.poll(thickness).toBe(7);
    await expect(
      manager.getByText('پارامترها با نسخهٔ ذخیره‌شدهٔ پروژهٔ بازشده یکسان‌اند.', { exact: true }),
    ).toBeVisible();
    fail = true;
    await wall.fill('8');
    await wall.press('Enter');
    await page.clock.fastForward(2100);
    await expect(manager.getByRole('alert')).toContainText('عملیات پروژه انجام نشد');
    await expect(toggle).not.toBeChecked();
    expect(thickness()).toBe(7);
    await expect(wall).toHaveValue('8');
  } finally {
    release();
    await page.close();
    database.close();
  }
});

test('circular cutter exports an open-centered closed solid and blocks a tip thicker than its wall', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('CookieCutterTool-')) requests.push(request.url());
  });
  await page.goto('/');
  expect(requests).toEqual([]);
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  const panel = page.locator('.cookie-cutter-tool');
  await panel.locator('summary').click();
  await expect(panel.getByRole('status', { name: 'اعتبار هندسهٔ کاتر', exact: true })).toContainText(
    'مش کاتر بسته',
  );
  expect(requests).toHaveLength(1);
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'دانلود STL کاتر گرد', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toContain('D60-H20-W1.6-T0.6mm');
  const bytes = await readFile((await file.path())!);
  const triangles = bytes.readUInt32LE(80);
  expect(bytes.length).toBe(84 + triangles * 50);
  expect(triangles).toBe(7 * 128 * 2);
  for (let i = 0; i < triangles; i++)
    for (let corner = 0; corner < 3; corner++) {
      const offset = 84 + i * 50 + 12 + corner * 12;
      expect(Math.hypot(bytes.readFloatLE(offset), bytes.readFloatLE(offset + 8))).toBeGreaterThan(
        29.999,
      );
    }
  const wall = panel.getByRole('spinbutton', { name: 'ضخامت دیوارهٔ کاتر', exact: true });
  const tip = panel.getByRole('spinbutton', { name: 'ضخامت لبهٔ برش کاتر', exact: true });
  await wall.fill('0.8');
  await wall.press('Enter');
  await tip.fill('1');
  await tip.press('Enter');
  await expect(
    panel.getByRole('button', { name: 'دانلود STL کاتر گرد', exact: true }),
  ).toBeDisabled();
  await expect(panel.getByRole('status', { name: 'اعتبار هندسهٔ کاتر', exact: true })).toContainText(
    'ضخامت لبه نباید',
  );
  await tip.fill('0.4');
  await tip.press('Enter');
  await expect(
    panel.getByRole('button', { name: 'دانلود STL کاتر گرد', exact: true }),
  ).toBeEnabled();
  await expect(panel).toContainText('ایمنی تماس با غذا');
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  await page.getByRole('button', { name: '🏺 فرم', exact: true }).click();
  await expect(
    page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true }),
  ).toHaveValue('4');
});

for (const desktop of [false, true]) {
  test(`unknown nested project fields are rejected without rewriting archives or stored source (${desktop ? 'SQLite' : 'browser'})`, async ({
    page,
  }) => {
    const database = new DatabaseSync(':memory:');
    try {
      if (desktop) await installSqlBridge(page, database);
      await page.goto('/');
      await page.getByText('مدیریت پروژه‌ها — ذخیره با نام و بازکردن', { exact: true }).click();
      const manager = page.locator('.project-manager');
      await manager.getByRole('textbox', { name: 'نام پروژهٔ جدید', exact: true }).fill('دادهٔ اصلی');
      await manager.getByRole('button', { name: 'ذخیرهٔ وضعیت فعلی با نام', exact: true }).click();
      await expect(
        manager.getByRole('button', { name: 'بازکردن دادهٔ اصلی', exact: true }),
      ).toBeVisible();
      const readRaw = async () =>
        desktop
          ? (database.prepare('select document from patturn_projects').get()!.document as string)
          : await page.evaluate(() => localStorage.getItem('patturn:projects')!);
      const before = await readRaw();
      const record = desktop ? JSON.parse(before) : JSON.parse(before)[0];
      record.data.form.profile.nodes[0].unsupportedHandleMode = 'future';
      const input = manager.getByLabel('ورود فایل پروژهٔ نام‌دار', { exact: true });
      await expect(input).toBeEnabled();
      await input.setInputFiles({
        name: 'future-field.patturn',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ format: 'patturn', v: 1, project: record })),
      });
      await expect(manager.getByRole('alert')).toContainText('عملیات پروژه انجام نشد');
      expect(await readRaw()).toBe(before);
      const corrupt = JSON.stringify(desktop ? record : [record]);
      if (desktop) database.prepare('update patturn_projects set document = ?').run(corrupt);
      else await page.evaluate((raw) => localStorage.setItem('patturn:projects', raw), corrupt);
      await page.reload();
      await page.getByText('مدیریت پروژه‌ها — ذخیره با نام و بازکردن', { exact: true }).click();
      await expect(manager.getByRole('alert')).toContainText('فهرست پروژه‌ها خوانده نشد');
      await expect(
        manager.getByRole('button', { name: 'ذخیرهٔ وضعیت فعلی با نام', exact: true }),
      ).toBeDisabled();
      expect(await readRaw()).toBe(corrupt);
      await expect(
        page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true }),
      ).toHaveValue('4');
    } finally {
      await page.close();
      database.close();
    }
  });
}

test('real Web Locks serialize project writes across tabs and reject a stale opened snapshot', async ({
  page,
  context,
}) => {
  const second = await context.newPage();
  const label = 'مدیریت پروژه‌ها — ذخیره با نام و بازکردن';
  const hold = async () => {
    await page.evaluate(() => {
      const target = window as unknown as {
        releaseProjectLock: () => void;
        projectLockHeld: boolean;
      };
      target.projectLockHeld = false;
      const gate = new Promise<void>((resolve) => {
        target.releaseProjectLock = resolve;
      });
      void navigator.locks.request('patturn:projects:write', async () => {
        target.projectLockHeld = true;
        await gate;
      });
    });
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { projectLockHeld: boolean }).projectLockHeld),
      )
      .toBe(true);
  };
  const release = () =>
    page.evaluate(() =>
      (window as unknown as { releaseProjectLock: () => void }).releaseProjectLock(),
    );
  const queued = async () =>
    await page.evaluate(
      async () =>
        (await navigator.locks.query()).pending?.filter(
          (lock) => lock.name === 'patturn:projects:write',
        ).length ?? 0,
    );
  try {
    for (const tab of [page, second]) {
      await tab.goto('/');
      await tab.getByText(label, { exact: true }).click();
    }
    const firstManager = page.locator('.project-manager'),
      secondManager = second.locator('.project-manager');
    await expect(firstManager).toContainText('با Web Locks هماهنگ است');
    await hold();
    await firstManager.getByRole('textbox', { name: 'نام پروژهٔ جدید', exact: true }).fill('تب اول');
    await secondManager
      .getByRole('textbox', { name: 'نام پروژهٔ جدید', exact: true })
      .fill('تب دوم');
    await Promise.all(
      [firstManager, secondManager].map((manager) =>
        manager.getByRole('button', { name: 'ذخیرهٔ وضعیت فعلی با نام', exact: true }).click(),
      ),
    );
    await expect.poll(queued).toBe(2);
    expect(await page.evaluate(() => localStorage.getItem('patturn:projects'))).toBeNull();
    await release();
    await expect
      .poll(() =>
        page.evaluate(() => JSON.parse(localStorage.getItem('patturn:projects') ?? '[]').length),
      )
      .toBe(2);
    for (const tab of [page, second]) {
      const manager = tab.locator('.project-manager');
      await expect(
        manager.getByRole('button', { name: 'بازخوانی فهرست پروژه‌ها', exact: true }),
      ).toBeEnabled();
      await manager.getByRole('button', { name: 'بازخوانی فهرست پروژه‌ها', exact: true }).click();
      const open = manager.getByRole('button', { name: 'بازکردن تب اول', exact: true });
      await expect(open).toBeEnabled();
      tab.once('dialog', (dialog) => dialog.accept());
      await open.click();
      await expect(
        manager.getByRole('button', { name: 'ذخیرهٔ تغییرات در پروژهٔ بازشده', exact: true }),
      ).toBeVisible();
    }
    const wall = (tab: import('@playwright/test').Page) =>
      tab.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
    await wall(page).fill('5');
    await wall(page).press('Enter');
    await wall(second).fill('6');
    await wall(second).press('Enter');
    await hold();
    page.once('dialog', (dialog) => dialog.accept());
    second.once('dialog', (dialog) => dialog.accept());
    await Promise.all(
      [firstManager, secondManager].map((manager) =>
        manager.getByRole('button', { name: 'ذخیرهٔ تغییرات در پروژهٔ بازشده', exact: true }).click(),
      ),
    );
    await expect.poll(queued).toBe(2);
    await release();
    await expect
      .poll(
        async () =>
          (await firstManager.getByRole('alert').count()) +
          (await secondManager.getByRole('alert').count()),
      )
      .toBe(1);
    const error = (await firstManager.getByRole('alert').count()) ? firstManager : secondManager;
    await expect(error.getByRole('alert')).toContainText('تعارض ذخیره');
    const records = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('patturn:projects')!),
    );
    expect(records).toHaveLength(2);
    expect([5, 6]).toContain(
      records.find((r: { name: string }) => r.name === 'تب اول').data.form.wallThickness,
    );
    expect(records.find((r: { name: string }) => r.name === 'تب دوم').data.form.wallThickness).toBe(
      4,
    );
    await expect(wall(page)).toHaveValue('5');
    await expect(wall(second)).toHaveValue('6');
  } finally {
    await release().catch(() => {});
    await second.close();
  }
});

test('browser without Web Locks displays the single-tab limitation and still saves locally', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true }),
  );
  await page.goto('/');
  await page.getByText('مدیریت پروژه‌ها — ذخیره با نام و بازکردن', { exact: true }).click();
  const manager = page.locator('.project-manager');
  await expect(manager).toContainText('فقط یک تب باز نگه دارید');
  await manager.getByRole('textbox', { name: 'نام پروژهٔ جدید', exact: true }).fill('تک‌تب');
  await manager.getByRole('button', { name: 'ذخیرهٔ وضعیت فعلی با نام', exact: true }).click();
  await expect(manager.getByRole('button', { name: 'بازکردن تک‌تب', exact: true })).toBeVisible();
  const before = await page.evaluate(() => localStorage.getItem('patturn:projects'));
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request: () => Promise.reject(Error('LOCK_FAILED')) },
    }),
  );
  await manager
    .getByRole('textbox', { name: 'نام پروژهٔ جدید', exact: true })
    .fill('نباید نوشته شود');
  await manager.getByRole('button', { name: 'ذخیرهٔ وضعیت فعلی با نام', exact: true }).click();
  await expect(manager.getByRole('alert')).toContainText('عملیات پروژه انجام نشد');
  expect(await page.evaluate(() => localStorage.getItem('patturn:projects'))).toBe(before);
});

for (const desktop of [false, true]) {
  test(`project rename retains identity and dirty edits; deletion refuses an unseen revision (${desktop ? 'SQLite' : 'browser'})`, async ({
    page,
  }) => {
    const database = new DatabaseSync(':memory:');
    try {
      if (desktop) await installSqlBridge(page, database);
      await page.goto('/');
      await page.getByText('مدیریت پروژه‌ها — ذخیره با نام و بازکردن', { exact: true }).click();
      const manager = page.locator('.project-manager');
      await manager.getByRole('textbox', { name: 'نام پروژهٔ جدید', exact: true }).fill('نام قبلی');
      await manager.getByRole('button', { name: 'ذخیرهٔ وضعیت فعلی با نام', exact: true }).click();
      await expect(
        manager.getByRole('button', { name: 'بازکردن نام قبلی', exact: true }),
      ).toBeVisible();
      const read = async () =>
        desktop
          ? JSON.parse(
              database.prepare('select document from patturn_projects').get()!.document as string,
            )
          : await page.evaluate(() => JSON.parse(localStorage.getItem('patturn:projects')!)[0]);
      const original = await read();
      page.once('dialog', (dialog) => dialog.accept());
      await manager.getByRole('button', { name: 'بازکردن نام قبلی', exact: true }).click();
      const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
      await wall.fill('6');
      await wall.press('Enter');
      page.once('dialog', (dialog) => dialog.dismiss());
      await manager.getByRole('button', { name: 'تغییر نام نام قبلی', exact: true }).click();
      expect((await read()).name).toBe('نام قبلی');
      page.once('dialog', (dialog) => dialog.accept('نام تازه'));
      await manager.getByRole('button', { name: 'تغییر نام نام قبلی', exact: true }).click();
      await expect(
        manager.getByRole('button', { name: 'بازکردن نام تازه', exact: true }),
      ).toBeVisible();
      const renamed = await read();
      expect(renamed.id).toBe(original.id);
      expect(renamed.createdAt).toBe(original.createdAt);
      expect(renamed.data.form).toEqual(original.data.form);
      await expect(wall).toHaveValue('6');
      await expect(manager).toContainText('پروژهٔ بازشده: نام تازه');
      page.once('dialog', (dialog) => dialog.accept());
      await manager
        .getByRole('button', { name: 'ذخیرهٔ تغییرات در پروژهٔ بازشده', exact: true })
        .click();
      await expect.poll(async () => (await read()).data.form.wallThickness).toBe(6);
      const saved = await read();
      const competitor = { ...saved, name: 'رقیب', data: { ...saved.data, name: 'رقیب' } };
      if (desktop)
        database
          .prepare('update patturn_projects set document = ?')
          .run(JSON.stringify(competitor));
      else
        await page.evaluate(
          (record) => localStorage.setItem('patturn:projects', JSON.stringify([record])),
          competitor,
        );
      page.once('dialog', (dialog) => dialog.accept());
      await manager.getByRole('button', { name: 'حذف نام تازه', exact: true }).click();
      await expect(manager.getByRole('alert')).toContainText('تعارض ذخیره');
      expect(await read()).toEqual(competitor);
      await manager.getByRole('button', { name: 'بازخوانی فهرست پروژه‌ها', exact: true }).click();
      const remove = manager.getByRole('button', { name: 'حذف رقیب', exact: true });
      await expect(remove).toBeEnabled();
      page.once('dialog', (dialog) => dialog.accept());
      await remove.click();
      await expect(manager.getByRole('button', { name: 'بازکردن رقیب', exact: true })).toHaveCount(
        0,
      );
      await expect(
        manager.getByRole('button', { name: 'ذخیرهٔ تغییرات در پروژهٔ بازشده', exact: true }),
      ).toHaveCount(0);
      await expect(wall).toHaveValue('6');
      if (desktop)
        expect(database.prepare('select count(*) as n from patturn_projects').get()!.n).toBe(0);
      else
        expect(
          await page.evaluate(() => JSON.parse(localStorage.getItem('patturn:projects')!)),
        ).toEqual([]);
    } finally {
      await page.close();
      database.close();
    }
  });
}

test('native close IPC asks about dirty named projects, supports cancellation and never claims an exit flush', async ({
  page,
}) => {
  const database = new DatabaseSync(':memory:');
  try {
    await installSqlBridge(page, database);
    await page.addInitScript(() => {
      type EventCallback = (event: unknown) => Promise<void>;
      const callbacks = new Map<number, EventCallback>();
      let next = 1;
      let closeId = 0;
      const target = window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (command: string, args: any) => Promise<any>;
          metadata: unknown;
          transformCallback: (handler: EventCallback) => number;
        };
        __TAURI_EVENT_PLUGIN_INTERNALS__: unknown;
        nativeCloseState: {
          destroyed: number;
          prompts: number;
          accept: boolean;
          fail: boolean;
          ready: boolean;
        };
        triggerNativeClose: () => Promise<void>;
      };
      const state = {
        destroyed: 0,
        prompts: 0,
        accept: false,
        fail: false,
        ready: false,
        listenFail: true,
        listenCalls: 0,
        unlistenCalls: 0,
      };
      target.nativeCloseState = state;
      const original = target.__TAURI_INTERNALS__.invoke;
      target.__TAURI_INTERNALS__.metadata = { currentWindow: { label: 'main' } };
      target.__TAURI_INTERNALS__.transformCallback = (callback) => {
        const id = next++;
        callbacks.set(id, callback);
        return id;
      };
      target.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
        unregisterListener: (_event: string, id: number) => {
          callbacks.delete(id);
        },
      };
      target.__TAURI_INTERNALS__.invoke = async (command, args) => {
        if (command === 'plugin:event|listen') {
          state.listenCalls++;
          if (state.listenFail) throw Error('synthetic registration failure');
          closeId = args.handler;
          state.ready = true;
          return closeId;
        }
        if (command === 'plugin:event|unlisten') {
          state.unlistenCalls++;
          return null;
        }
        if (command === 'plugin:window|destroy') {
          state.destroyed++;
          return null;
        }
        if (command === 'plugin:dialog|message') {
          state.prompts++;
          if (state.fail) throw Error('synthetic native dialog failure');
          return args.buttons.OkCancelCustom[state.accept ? 0 : 1];
        }
        return original(command, args);
      };
      target.triggerNativeClose = async () => {
        await callbacks.get(closeId)!({
          event: 'tauri://close-requested',
          id: closeId,
          payload: null,
        });
      };
    });
    await page.goto('/');
    await page.getByText('مدیریت پروژه‌ها — ذخیره با نام و بازکردن', { exact: true }).click();
    const manager = page.locator('.project-manager');
    const state = () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              nativeCloseState: {
                ready: boolean;
                prompts: number;
                destroyed: number;
                listenCalls: number;
                unlistenCalls: number;
              };
            }
          ).nativeCloseState,
      );
    const guardStatus = manager.getByRole('status', {
      name: 'وضعیت هشدار بستن دسکتاپ',
      exact: true,
    });
    const retry = manager.getByRole('button', {
      name: 'تلاش دوباره برای هشدار بستن دسکتاپ',
      exact: true,
    });
    await expect(guardStatus).toContainText('فعال نیست یا خطا داده است');
    await page.evaluate(
      () =>
        ((
          window as unknown as { nativeCloseState: { listenFail: boolean } }
        ).nativeCloseState.listenFail = false),
    );
    await retry.click();
    await expect(guardStatus).toContainText('آماده است');
    expect((await state()).listenCalls).toBe(2);
    await expect.poll(async () => (await state()).ready).toBe(true);
    const close = () =>
      page.evaluate(() =>
        (window as unknown as { triggerNativeClose: () => Promise<void> }).triggerNativeClose(),
      );
    await close();
    expect((await state()).destroyed).toBe(1);
    expect((await state()).prompts).toBe(0);
    await manager.getByRole('textbox', { name: 'نام پروژهٔ جدید', exact: true }).fill('پیش از خروج');
    await manager.getByRole('button', { name: 'ذخیرهٔ وضعیت فعلی با نام', exact: true }).click();
    page.once('dialog', (dialog) => dialog.accept());
    await manager.getByRole('button', { name: 'بازکردن پیش از خروج', exact: true }).click();
    const wall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
    await wall.fill('6');
    await wall.press('Enter');
    await close();
    expect((await state()).destroyed).toBe(1);
    expect((await state()).prompts).toBe(1);
    await page.evaluate(
      () =>
        ((window as unknown as { nativeCloseState: { fail: boolean } }).nativeCloseState.fail =
          true),
    );
    await close();
    expect((await state()).destroyed).toBe(1);
    await expect(manager).toContainText('هشدار بستن پنجرهٔ دسکتاپ فعال نیست یا خطا داده است');
    await page.evaluate(() => {
      const state = (window as unknown as { nativeCloseState: { fail: boolean; accept: boolean } })
        .nativeCloseState;
      state.fail = false;
      state.accept = true;
    });
    await retry.click();
    await expect(guardStatus).toContainText('آماده است');
    await expect(retry).toHaveCount(0);
    expect((await state()).listenCalls).toBe(3);
    await expect.poll(async () => (await state()).unlistenCalls).toBe(1);
    await close();
    expect((await state()).destroyed).toBe(2);
    expect(
      JSON.parse(
        database.prepare('select document from patturn_projects').get()!.document as string,
      ).data.form.wallThickness,
    ).toBe(4);
    await expect(wall).toHaveValue('6');
  } finally {
    await page.close();
    database.close();
  }
});

test('convex polygon SVG cutter honors physical viewBox scale, validates STL and rejects unsupported SVG without stale output', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  const panel = page.locator('.cookie-cutter-tool');
  await panel.locator('summary').click();
  const input = panel.getByLabel('ورود SVG تک‌چندضلعی محدب', { exact: true });
  const valid =
    '<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="60mm" viewBox="10 20 40 30"><polygon points="10,20 50,20 50,50 10,50"/></svg>';
  await input.setInputFiles({
    name: 'rectangle.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(valid),
  });
  const exportPolygon = panel.getByRole('button', { name: 'دانلود STL کاتر چندضلعی', exact: true });
  await expect(exportPolygon).toBeEnabled();
  await expect(panel).toContainText('۸۰ × ۶۰ mm');
  await expect(
    panel.getByRole('img', {
      name: 'پلان کاتر چندضلعی؛ دهانهٔ داخلی باز و دستگیرهٔ بیرونی',
      exact: true,
    }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await exportPolygon.click();
  const file = await download;
  expect(file.suggestedFilename()).toContain('convex-cutter');
  const bytes = await readFile((await file.path())!);
  const count = bytes.readUInt32LE(80);
  expect(count).toBe(7 * 4 * 2);
  expect(bytes.length).toBe(84 + count * 50);
  let maxX = 0,
    maxZ = 0,
    maxY = 0;
  for (let i = 0; i < count; i++)
    for (let corner = 0; corner < 3; corner++) {
      const offset = 84 + i * 50 + 12 + corner * 12;
      maxX = Math.max(maxX, Math.abs(bytes.readFloatLE(offset)));
      maxZ = Math.max(maxZ, Math.abs(bytes.readFloatLE(offset + 8)));
      maxY = Math.max(maxY, bytes.readFloatLE(offset + 4));
    }
  expect(maxX).toBeCloseTo(44.6, 3);
  expect(maxZ).toBeCloseTo(34.6, 3);
  expect(maxY).toBe(20);
  const invalid = [
    valid.replace('80mm', '80px'),
    valid.replace('80mm', '100mm'),
    valid.replace('10,20 50,20 50,50 10,50', '10,20 50,20 30,30 50,50 10,50'),
    valid.replace('<polygon', '<polygon transform="translate(1 1)"'),
    valid.replace('<polygon', '<script/> <polygon'),
    valid.replace('10,20 50,20', '10,,20 50,20'),
    valid.replace('10,20 50,20', '0,20 50,20'),
    valid.replace('points=', 'onclick="alert(1)" points='),
    valid.replace('<polygon points="10,20 50,20 50,50 10,50"/>', '<path d="M10 20H50V50H10Z"/>'),
    '<!DOCTYPE svg [<!ENTITY x "data">]>' + valid,
    valid.replace('viewBox="10 20 40 30"', 'viewBox="10 20 0 30"'),
    '<svg',
    ' '.repeat(64 * 1024 + 1),
  ];
  for (const source of invalid) {
    await expect(input).toBeEnabled();
    await input.setInputFiles({
      name: 'unsupported.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(source),
    });
    await expect(
      panel.getByRole('status', { name: 'اعتبار هندسهٔ کاتر', exact: true }),
    ).toContainText('خروجی تا ورود فایل معتبر');
    await expect(exportPolygon).toBeDisabled();
  }
  await input.setInputFiles({
    name: 'valid-again.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(valid),
  });
  await expect(exportPolygon).toBeEnabled();
  await panel.getByRole('button', { name: 'بازگشت به کاتر گرد', exact: true }).click();
  await expect(
    panel.getByRole('button', { name: 'دانلود STL کاتر گرد', exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('image trace feeds the convex cutter at the current mm scale and never drops holes or reuses an obsolete result', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('CookieCutterTool-')) requested.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('ردیابی تصویر — Otsu و کانتور', { exact: true }).click();
  const trace = page.locator('.image-trace-tool');
  const picture = async (hole: boolean) =>
    await page.evaluate((hole) => {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = 'black';
      ctx.fillRect(8, 8, 16, 16);
      if (hole) {
        ctx.fillStyle = 'white';
        ctx.fillRect(12, 12, 8, 8);
      }
      return canvas.toDataURL('image/png').split(',')[1]!;
    }, hole);
  const upload = async (hole: boolean) =>
    await trace.getByLabel('تصویر ردیابی', { exact: true }).setInputFiles({
      name: hole ? 'ring.png' : 'square.png',
      mimeType: 'image/png',
      buffer: Buffer.from(await picture(hole), 'base64'),
    });
  await upload(false);
  await expect(trace.getByRole('status').filter({ hasText: 'کانتور؛' })).toContainText('۱ کانتور');
  expect(requested).toEqual([]);
  const panel = trace.locator('.traced-cutter-tool');
  await panel.locator('summary').click();
  const output = panel.getByRole('button', { name: 'دانلود STL کاتر چندضلعی', exact: true });
  await expect(output).toBeEnabled();
  expect(requested).toHaveLength(1);
  await expect(panel).toContainText('۵۰ × ۵۰ mm');
  await expect(panel.getByLabel('ورود SVG تک‌چندضلعی محدب', { exact: true })).toHaveCount(0);
  const download = async () => {
    const pending = page.waitForEvent('download');
    await output.click();
    const file = await pending;
    return await readFile((await file.path())!);
  };
  const contourSvg = panel.getByRole('button', { name: 'دانلود SVG مرز داخلی کاتر', exact: true });
  const pendingSvg = page.waitForEvent('download');
  await contourSvg.click();
  const svgBytes = await readFile((await (await pendingSvg).path())!);
  expect(svgBytes.toString('utf8')).toContain('width="50mm" height="50mm"');
  const initial = await download();
  const maxX = (bytes: Buffer) => {
    let radius = 0;
    for (let i = 0; i < bytes.readUInt32LE(80); i++)
      for (let j = 0; j < 3; j++)
        radius = Math.max(radius, Math.abs(bytes.readFloatLE(84 + i * 50 + 12 + j * 12)));
    return radius;
  };
  expect(maxX(initial)).toBeCloseTo(29.6, 2);
  const width = trace.getByRole('spinbutton', { name: 'عرض مرجع تصویر', exact: true });
  await width.fill('80');
  await width.press('Enter');
  await expect(panel).toContainText('۴۰ × ۴۰ mm');
  expect(maxX(await download())).toBeCloseTo(24.6, 2);
  await width.fill('20');
  await width.press('Enter');
  await expect(output).toBeDisabled();
  await expect(contourSvg).toBeDisabled();
  await expect(panel.getByRole('status', { name: 'اعتبار هندسهٔ کاتر', exact: true })).toContainText(
    'خروجی مسدود شد',
  );
  await width.fill('100');
  await width.press('Enter');
  await expect(output).toBeEnabled();
  await upload(true);
  await expect(trace.getByRole('status').filter({ hasText: 'کانتور؛' })).toContainText('۲ کانتور');
  await panel.locator('summary').click();
  await expect(output).toBeDisabled();
  await expect(contourSvg).toBeDisabled();
  await expect(panel).toContainText('دقیقاً یک کانتور محدب بدون سوراخ');
  await expect(panel.getByRole('button', { name: 'دانلود STL کاتر گرد', exact: true })).toHaveCount(
    0,
  );
  await upload(false);
  await expect(trace.getByRole('status').filter({ hasText: 'کانتور؛' })).toContainText('۱ کانتور');
  await panel.locator('summary').click();
  await expect(output).toBeEnabled();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('point sketch cutter supports pointer and keyboard drafting and invalidates output before edits', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  const panel = page.locator('.cookie-cutter-tool');
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: 'رسم چندضلعی محدب با نقاط', exact: true }).click();
  const canvas = panel.getByRole('img', {
    name: 'صفحهٔ رسم نقطه‌ای کاتر با نشانگر صفحه‌کلید',
    exact: true,
  });
  const output = panel.getByRole('button', { name: 'دانلود STL کاتر چندضلعی', exact: true });
  const finish = panel.getByRole('button', { name: 'بستن و بررسی طرح کاتر', exact: true });
  await expect(output).toBeDisabled();
  await expect(finish).toBeDisabled();
  const point = async (x: number, y: number) => {
    const box = (await canvas.boundingBox())!;
    await canvas.click({
      position: { x: ((x + 5.3) / 160) * box.width, y: ((y + 5.3) / 160) * box.height },
    });
  };
  for (const [x, y] of [
    [20, 20],
    [80, 20],
    [80, 80],
    [20, 80],
  ])
    await point(x!, y!);
  await expect(output).toBeDisabled();
  await finish.click();
  await expect(output).toBeEnabled();
  await expect(panel).toContainText('۶۰ × ۶۰ mm');
  const pending = page.waitForEvent('download');
  await output.click();
  const file = await pending;
  const bytes = await readFile((await file.path())!);
  expect(bytes.readUInt32LE(80)).toBe(56);
  let maxX = 0;
  for (let i = 0; i < 56; i++)
    for (let j = 0; j < 3; j++)
      maxX = Math.max(maxX, Math.abs(bytes.readFloatLE(84 + i * 50 + 12 + j * 12)));
  expect(maxX).toBeCloseTo(34.6, 2);
  await point(50, 50);
  await expect(output).toBeDisabled();
  await finish.click();
  await expect(panel.getByRole('alert')).toContainText('طرح پذیرفته نشد');
  await panel.getByRole('button', { name: 'حذف آخرین نقطهٔ کاتر', exact: true }).click();
  await finish.click();
  await expect(output).toBeEnabled();
  await panel.getByRole('button', { name: 'پاک‌کردن نقاط کاتر', exact: true }).click();
  await expect(output).toBeDisabled();
  // A new manual session starts the keyboard cursor at 30,30 mm.
  await panel.getByRole('button', { name: 'بازگشت به کاتر گرد', exact: true }).click();
  await panel.getByRole('button', { name: 'رسم چندضلعی محدب با نقاط', exact: true }).click();
  await canvas.focus();
  await page.keyboard.press('Enter');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Space');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Enter');
  await finish.click();
  await expect(output).toBeEnabled();
  await expect(panel).toContainText('۴۰ × ۴۰ mm');
  await canvas.focus();
  await page.keyboard.press('Backspace');
  await expect(output).toBeDisabled();
  await expect(finish).toBeDisabled();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('manual cutter vertex edits require explicit apply and revalidation and reject invalid coordinates', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  const panel = page.locator('.cookie-cutter-tool');
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: 'رسم چندضلعی محدب با نقاط', exact: true }).click();
  const canvas = panel.getByRole('img', {
    name: 'صفحهٔ رسم نقطه‌ای کاتر با نشانگر صفحه‌کلید',
    exact: true,
  });
  const finish = panel.getByRole('button', { name: 'بستن و بررسی طرح کاتر', exact: true });
  const output = panel.getByRole('button', { name: 'دانلود STL کاتر چندضلعی', exact: true });
  await canvas.focus();
  await page.keyboard.press('Enter');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Enter');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Enter');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Enter');
  await finish.click();
  await expect(output).toBeEnabled();
  const selection = panel.getByLabel('انتخاب رأس کاتر', { exact: true });
  await selection.selectOption('1');
  await expect(output).toBeEnabled();
  const x = panel.getByRole('spinbutton', { name: 'مختصات افقی رأس کاتر (mm)', exact: true });
  const y = panel.getByRole('spinbutton', { name: 'مختصات عمودی رأس کاتر (mm)', exact: true });
  const apply = panel.getByRole('button', { name: 'اعمال مختصات رأس کاتر', exact: true });
  await x.fill('90');
  await expect(output).toBeDisabled();
  await expect(finish).toBeDisabled();
  await apply.click();
  await expect(output).toBeDisabled();
  await finish.click();
  await expect(output).toBeEnabled();
  await expect(panel).toContainText('۶۰ × ۴۰ mm');
  const pending = page.waitForEvent('download');
  await output.click();
  const bytes = await readFile((await (await pending).path())!);
  let minX = Infinity,
    maxX = -Infinity;
  for (let i = 0; i < bytes.readUInt32LE(80); i++)
    for (let j = 0; j < 3; j++) {
      const value = bytes.readFloatLE(84 + i * 50 + 12 + j * 12);
      minX = Math.min(minX, value);
      maxX = Math.max(maxX, value);
    }
  expect(maxX - minX).toBeGreaterThan(69);
  expect(maxX - minX).toBeLessThan(80);
  for (const value of ['', '-1', '151']) {
    await x.fill(value);
    await apply.click();
    await expect(panel.getByRole('alert')).toContainText('هر دو مختصات');
    await expect(finish).toBeDisabled();
    await expect(output).toBeDisabled();
  }
  await x.fill('50');
  await y.fill('60');
  await apply.click();
  await finish.click();
  await expect(panel.getByRole('alert')).toContainText('طرح پذیرفته نشد');
  await expect(output).toBeDisabled();
  await x.fill('90');
  await y.fill('30');
  await apply.click();
  await finish.click();
  await expect(output).toBeEnabled();
  // Removing a selected middle vertex changes the contour, not just the last point.
  await panel.getByRole('button', { name: 'حذف رأس انتخاب‌شدهٔ کاتر', exact: true }).click();
  await expect(output).toBeDisabled();
  await expect(selection.locator('option')).toHaveCount(3);
  await finish.click();
  await expect(output).toBeEnabled();
  // A pending draft must never survive a structural edit while close is re-enabled.
  await x.fill('100');
  await expect(finish).toBeDisabled();
  await panel.getByRole('button', { name: 'حذف آخرین نقطهٔ کاتر', exact: true }).click();
  await expect(x).not.toHaveValue('100');
  await expect(output).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('manual cutter drag mode moves only an existing vertex, blocks stale STL and restores cancelled gestures', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  const panel = page.locator('.cookie-cutter-tool');
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: 'رسم چندضلعی محدب با نقاط', exact: true }).click();
  const canvas = panel.getByRole('img', {
    name: 'صفحهٔ رسم نقطه‌ای کاتر با نشانگر صفحه‌کلید',
    exact: true,
  });
  const finish = panel.getByRole('button', { name: 'بستن و بررسی طرح کاتر', exact: true });
  const output = panel.getByRole('button', { name: 'دانلود STL کاتر چندضلعی', exact: true });
  await canvas.focus();
  await page.keyboard.press('Enter');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Enter');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Enter');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Enter');
  await finish.click();
  const mode = panel.getByRole('button', { name: 'حالت جابه‌جایی رأس با کشیدن', exact: true });
  await mode.click();
  await expect(mode).toHaveAttribute('aria-pressed', 'true');
  const location = async (x: number, y: number) => {
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    return { x: box.x + ((x + 5.3) / 160) * box.width, y: box.y + ((y + 5.3) / 160) * box.height };
  };
  const move = async (x: number, y: number) => {
    const p = await location(x, y);
    await page.mouse.move(p.x, p.y);
  };
  const selection = panel.getByLabel('انتخاب رأس کاتر', { exact: true });
  // Empty space in move mode must not add a point or invalidate a closed shape.
  await move(110, 110);
  await page.mouse.click((await location(110, 110)).x, (await location(110, 110)).y);
  await expect(selection.locator('option')).toHaveCount(4);
  await expect(output).toBeEnabled();
  await move(70, 30);
  await page.mouse.down();
  await expect(output).toBeDisabled();
  await expect(finish).toBeDisabled();
  await expect(mode).toBeDisabled();
  await move(90, 30);
  await page.mouse.up();
  await expect(finish).toBeEnabled();
  await expect(output).toBeDisabled();
  await expect(selection).toHaveValue('1');
  await expect(
    panel.getByRole('spinbutton', { name: 'مختصات افقی رأس کاتر (mm)', exact: true }),
  ).toHaveValue('90');
  await finish.click();
  await expect(output).toBeEnabled();
  await expect(panel).toContainText('۶۰ × ۴۰ mm');
  const pending = page.waitForEvent('download');
  await output.click();
  const bytes = await readFile((await (await pending).path())!);
  expect(bytes.readUInt32LE(80)).toBe(56);
  // Move into the interior: geometry must reject, with no silent convex hull.
  await move(90, 30);
  await page.mouse.down();
  await move(50, 60);
  await page.mouse.up();
  await finish.click();
  await expect(panel.getByRole('alert')).toContainText('طرح پذیرفته نشد');
  await expect(output).toBeDisabled();
  // Escape restores the previous invalid coordinates; it does not resurrect an export.
  await move(50, 60);
  await page.mouse.down();
  await move(90, 30);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(
    panel.getByRole('spinbutton', { name: 'مختصات افقی رأس کاتر (mm)', exact: true }),
  ).toHaveValue('50');
  await expect(output).toBeDisabled();
  // Recover with a completed gesture.
  await move(50, 60);
  await page.mouse.down();
  await move(90, 30);
  await page.mouse.up();
  await finish.click();
  await expect(output).toBeEnabled();
  // Captured pointer continues outside the SVG and clamps to the physical workspace.
  await move(90, 30);
  await page.mouse.down();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width + 25, box.y + box.height / 2);
  await page.mouse.up();
  await expect(
    panel.getByRole('spinbutton', { name: 'مختصات افقی رأس کاتر (mm)', exact: true }),
  ).toHaveValue('150');
  await expect(output).toBeDisabled();
  // Native pointer cancellation restores the snapshot, never the old validated status.
  await move(150, 75);
  await page.mouse.down();
  await move(100, 30);
  await canvas.dispatchEvent('pointercancel', {
    pointerId: 1,
    isPrimary: true,
    pointerType: 'mouse',
  });
  await page.mouse.up();
  await expect(
    panel.getByRole('spinbutton', { name: 'مختصات افقی رأس کاتر (mm)', exact: true }),
  ).toHaveValue('150');
  await expect(output).toBeDisabled();
  await expect(selection.locator('option')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('cutter contour SVG round trips manual and fractional imported geometry without storing 3D settings', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  const panel = page.locator('.cookie-cutter-tool');
  await panel.locator('summary').click();
  const svg = panel.getByRole('button', { name: 'دانلود SVG مرز داخلی کاتر', exact: true });
  const stl = panel.getByRole('button', { name: 'دانلود STL کاتر چندضلعی', exact: true });
  const download = async (name: string) => {
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name, exact: true }).click();
    const file = await pending;
    return { bytes: await readFile((await file.path())!), name: file.suggestedFilename() };
  };
  await expect(svg).toHaveCount(0);
  await panel.getByRole('button', { name: 'رسم چندضلعی محدب با نقاط', exact: true }).click();
  await expect(svg).toBeDisabled();
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
  await panel.getByRole('button', { name: 'بستن و بررسی طرح کاتر', exact: true }).click();
  await expect(svg).toBeEnabled();
  for (const source of ['manual', 'fractional']) {
    if (source === 'fractional') {
      await panel.getByLabel('ورود SVG تک‌چندضلعی محدب', { exact: true }).setInputFiles({
        name: 'fractional.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><polygon points="10.25,12.5 70.625,12.5 70.625,73.75 10.25,73.75"/></svg>',
        ),
      });
      await expect(svg).toBeEnabled();
    }
    const before = await download('دانلود STL کاتر چندضلعی');
    const exported = await download('دانلود SVG مرز داخلی کاتر');
    expect(exported.name).toMatch(/^convex-cutter_contour_W.*mm\.svg$/);
    const text = exported.bytes.toString('utf8');
    expect(text).not.toContain('<?');
    expect(text).not.toContain('path');
    expect(text).not.toContain('heightMm');
    if (source === 'manual') {
      await panel
        .getByRole('spinbutton', { name: 'مختصات افقی رأس کاتر (mm)', exact: true })
        .fill('80');
      await expect(svg).toBeDisabled();
      await expect(stl).toBeDisabled();
    }
    await panel.getByRole('button', { name: 'بازگشت به کاتر گرد', exact: true }).click();
    await expect(svg).toHaveCount(0);
    await panel
      .getByLabel('ورود SVG تک‌چندضلعی محدب', { exact: true })
      .setInputFiles({ name: exported.name, mimeType: 'image/svg+xml', buffer: exported.bytes });
    await expect(svg).toBeEnabled();
    expect((await download('دانلود STL کاتر چندضلعی')).bytes).toEqual(before.bytes);
    expect((await download('دانلود SVG مرز داخلی کاتر')).bytes).toEqual(exported.bytes);
  }
  const tip = panel.getByRole('spinbutton', { name: 'ضخامت لبهٔ برش کاتر', exact: true });
  const wall = panel.getByRole('spinbutton', { name: 'ضخامت دیوارهٔ کاتر', exact: true });
  await wall.fill('0.8');
  await wall.press('Enter');
  await tip.fill('1.2');
  await tip.press('Enter');
  await expect(svg).toBeDisabled();
  await expect(stl).toBeDisabled();
  await panel
    .getByLabel('ورود SVG تک‌چندضلعی محدب', { exact: true })
    .setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(svg).toBeDisabled();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('fractional SVG can resume in the point editor without silent rounding or stale exports', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  const panel = page.locator('.cookie-cutter-tool');
  await panel.locator('summary').click();
  const input = panel.getByLabel('ورود SVG تک‌چندضلعی محدب', { exact: true });
  const edit = panel.getByRole('button', { name: 'ویرایش نقاط SVG واردشده', exact: true });
  const stl = panel.getByRole('button', { name: 'دانلود STL کاتر چندضلعی', exact: true });
  const svg = panel.getByRole('button', { name: 'دانلود SVG مرز داخلی کاتر', exact: true });
  const download = async (name: string) => {
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name, exact: true }).click();
    return await readFile((await (await pending).path())!);
  };
  await expect(edit).toHaveCount(0);
  await input.setInputFiles({
    name: 'source.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><polygon points="10.25,12.5 70.625,12.5 70.625,73.75 10.25,73.75"/></svg>',
    ),
  });
  await expect(edit).toBeVisible();
  const height = panel.getByRole('spinbutton', { name: 'ارتفاع کاتر', exact: true });
  await height.fill('25');
  await height.press('Enter');
  const before = await download('دانلود STL کاتر چندضلعی');
  await edit.click();
  await expect(stl).toBeDisabled();
  await expect(svg).toBeDisabled();
  await expect(input).toHaveCount(0);
  await expect(height).toHaveValue('25');
  const finish = panel.getByRole('button', { name: 'بستن و بررسی طرح کاتر', exact: true });
  await finish.click();
  await expect(stl).toBeEnabled();
  expect(await download('دانلود STL کاتر چندضلعی')).toEqual(before);
  const selection = panel.getByLabel('انتخاب رأس کاتر', { exact: true });
  await selection.selectOption('1');
  const x = panel.getByRole('spinbutton', { name: 'مختصات افقی رأس کاتر (mm)', exact: true });
  await expect(x).toHaveValue('60.375');
  await x.fill('61.125');
  await expect(stl).toBeDisabled();
  await expect(svg).toBeDisabled();
  await expect(finish).toBeDisabled();
  await panel.getByRole('button', { name: 'اعمال مختصات رأس کاتر', exact: true }).click();
  await finish.click();
  await expect(x).toHaveValue('61.125');
  await expect(stl).toBeEnabled();
  const saved = await download('دانلود SVG مرز داخلی کاتر');
  expect(saved.toString('utf8')).toContain('width="61.125mm"');
  await panel.getByRole('button', { name: 'بازگشت به کاتر گرد', exact: true }).click();
  await input.setInputFiles({ name: 'saved.svg', mimeType: 'image/svg+xml', buffer: saved });
  await expect(edit).toBeVisible();
  await edit.click();
  await expect(stl).toBeDisabled();
  await selection.selectOption('1');
  await expect(x).toHaveValue('61.125');
  await finish.click();
  await expect(stl).toBeEnabled();
  await panel.getByRole('button', { name: 'بازگشت به کاتر گرد', exact: true }).click();
  await input.setInputFiles({
    name: 'bad.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg/>'),
  });
  await expect(panel.getByRole('alert')).toContainText('SVG پشتیبانی نشد');
  await expect(edit).toHaveCount(0);
  await panel.getByRole('button', { name: 'بازگشت به کاتر گرد', exact: true }).click();
  await panel.getByRole('button', { name: 'رسم چندضلعی محدب با نقاط', exact: true }).click();
  await expect(selection).toHaveCount(0);
  await expect(finish).toBeDisabled();
  await expect(stl).toBeDisabled();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('standalone cutter files restore circle and editable polygon settings and reject future data without stale exports', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  const panel = page.locator('.cookie-cutter-tool');
  await panel.locator('summary').click();
  const fileInput = panel.getByLabel('بازکردن فایل مستقل کاتر', { exact: true });
  const save = panel.getByRole('button', { name: 'ذخیرهٔ فایل مستقل کاتر', exact: true });
  const download = async (name: string) => {
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name, exact: true }).click();
    const file = await pending;
    return { bytes: await readFile((await file.path())!), name: file.suggestedFilename() };
  };
  const upload = async (bytes: Buffer) => {
    await expect(fileInput).toBeEnabled();
    await fileInput.setInputFiles({
      name: 'preset.cutter.json',
      mimeType: 'application/json',
      buffer: bytes,
    });
  };
  const height = panel.getByRole('spinbutton', { name: 'ارتفاع کاتر', exact: true });
  await height.fill('25');
  await height.press('Enter');
  const wall = panel.getByRole('spinbutton', { name: 'ضخامت دیوارهٔ کاتر', exact: true });
  await wall.fill('2');
  await wall.press('Enter');
  const original = await download('دانلود STL کاتر گرد');
  const circle = await download('ذخیرهٔ فایل مستقل کاتر');
  expect(circle.name).toBe('patturn-cutter.cutter.json');
  await height.fill('30');
  await height.press('Enter');
  await upload(circle.bytes);
  await expect(height).toHaveValue('25');
  await expect(save).toBeEnabled();
  expect((await download('دانلود STL کاتر گرد')).bytes).toEqual(original.bytes);
  const doc = JSON.parse(circle.bytes.toString('utf8'));
  doc.heightMm = 32;
  doc.wallMm = 2.4;
  doc.tipMm = 0.9;
  doc.shape = {
    kind: 'polygon',
    points: [
      [10.25, 12.5],
      [70.625, 12.5],
      [70.625, 73.75],
      [10.25, 73.75],
    ],
  };
  await upload(Buffer.from(JSON.stringify(doc)));
  const finish = panel.getByRole('button', { name: 'بستن و بررسی طرح کاتر', exact: true });
  const output = panel.getByRole('button', { name: 'دانلود STL کاتر چندضلعی', exact: true });
  await expect(output).toBeDisabled();
  await expect(save).toBeDisabled();
  await expect(height).toHaveValue('32');
  await expect(wall).toHaveValue('2.4');
  await expect(
    panel.getByRole('spinbutton', { name: 'ضخامت لبهٔ برش کاتر', exact: true }),
  ).toHaveValue('0.9');
  await panel.getByLabel('انتخاب رأس کاتر', { exact: true }).selectOption('1');
  await expect(
    panel.getByRole('spinbutton', { name: 'مختصات افقی رأس کاتر (mm)', exact: true }),
  ).toHaveValue('60.375');
  await finish.click();
  await expect(save).toBeEnabled();
  const polygon = await download('ذخیرهٔ فایل مستقل کاتر');
  const before = await download('دانلود STL کاتر چندضلعی');
  await panel.getByRole('button', { name: 'بازگشت به کاتر گرد', exact: true }).click();
  await upload(polygon.bytes);
  await expect(output).toBeDisabled();
  await finish.click();
  await expect(output).toBeEnabled();
  expect((await download('دانلود STL کاتر چندضلعی')).bytes).toEqual(before.bytes);
  await panel.getByRole('button', { name: 'بازگشت به کاتر گرد', exact: true }).click();
  for (const bad of [
    { ...doc, version: 2 },
    { ...doc, unknown: 1 },
    { ...doc, shape: { ...doc.shape, unknown: true } },
    { ...doc, units: 'cm' },
  ]) {
    await upload(Buffer.from(JSON.stringify(bad)));
    await expect(panel.getByRole('alert')).toContainText('فایل کاتر نامعتبر');
    await expect(save).toBeDisabled();
    await expect(
      panel.getByRole('button', { name: 'دانلود STL کاتر گرد', exact: true }),
    ).toBeDisabled();
    await expect(height).toHaveValue('32');
  }
  await upload(Buffer.alloc(65537, 32));
  await expect(panel.getByRole('alert')).toContainText('فایل کاتر نامعتبر');
  await expect(save).toBeDisabled();
  await upload(circle.bytes);
  await expect(save).toBeEnabled();
  await expect(height).toHaveValue('25');
  expect((await download('دانلود STL کاتر گرد')).bytes).toEqual(original.bytes);
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('reset cancels a delayed cutter file and its late result cannot replace a newer file', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  const panel = page.locator('.cookie-cutter-tool');
  await panel.locator('summary').click();
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function () {
      if (this.name !== 'delayed.cutter.json') return original.call(this);
      const file = this;
      return new Promise<string>((resolve) => {
        (window as unknown as { releaseCutterRead: () => Promise<void> }).releaseCutterRead =
          async () => resolve(await original.call(file));
      });
    };
  });
  const doc = {
    format: 'patturn-cutter',
    version: 1,
    units: 'mm',
    heightMm: 39,
    wallMm: 2,
    tipMm: 0.8,
    shape: { kind: 'circle', diameterMm: 90 },
  };
  const input = panel.getByLabel('بازکردن فایل مستقل کاتر', { exact: true });
  const save = panel.getByRole('button', { name: 'ذخیرهٔ فایل مستقل کاتر', exact: true });
  await input.setInputFiles({
    name: 'delayed.cutter.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await expect(save).toBeDisabled();
  await expect(input).toBeDisabled();
  await expect(panel.getByRole('status', { name: 'اعتبار هندسهٔ کاتر', exact: true })).toContainText(
    'در حال خواندن',
  );
  await panel.getByRole('button', { name: 'بازگشت به کاتر گرد', exact: true }).click();
  await expect(save).toBeEnabled();
  await input.setInputFiles({
    name: 'new.cutter.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...doc, heightMm: 25 })),
  });
  await expect(panel.getByRole('spinbutton', { name: 'ارتفاع کاتر', exact: true })).toHaveValue(
    '25',
  );
  await expect(save).toBeEnabled();
  await page.evaluate(async () => {
    await (window as unknown as { releaseCutterRead: () => Promise<void> }).releaseCutterRead();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
  await expect(panel.getByRole('spinbutton', { name: 'ارتفاع کاتر', exact: true })).toHaveValue(
    '25',
  );
  await expect(save).toBeEnabled();
});

test('local sketch undo groups drags, restores cleared contours and never consumes project history', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  const projectWall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await projectWall.fill('7');
  await projectWall.press('Enter');
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeEnabled();
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  const panel = page.locator('.cookie-cutter-tool');
  await panel.locator('summary').click();
  await panel.getByLabel('بازکردن فایل مستقل کاتر', { exact: true }).setInputFiles({
    name: 'square.cutter.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'patturn-cutter',
        version: 1,
        units: 'mm',
        heightMm: 20,
        wallMm: 1.6,
        tipMm: 0.6,
        shape: {
          kind: 'polygon',
          points: [
            [20, 20],
            [60, 20],
            [60, 60],
            [20, 60],
          ],
        },
      }),
    ),
  });
  const undo = panel.getByRole('button', { name: 'برگرداندن آخرین ویرایش کاتر', exact: true });
  const redo = panel.getByRole('button', { name: 'بازانجام ویرایش کاتر', exact: true });
  const canvas = panel.getByRole('img', {
    name: 'صفحهٔ رسم نقطه‌ای کاتر با نشانگر صفحه‌کلید',
    exact: true,
  });
  const finish = panel.getByRole('button', { name: 'بستن و بررسی طرح کاتر', exact: true });
  const output = panel.getByRole('button', { name: 'دانلود STL کاتر چندضلعی', exact: true });
  const save = panel.getByRole('button', { name: 'ذخیرهٔ فایل مستقل کاتر', exact: true });
  await expect(undo).toBeDisabled();
  await canvas.focus();
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeEnabled();
  await finish.click();
  await expect(output).toBeEnabled();
  const pending = page.waitForEvent('download');
  await output.click();
  const before = await readFile((await (await pending).path())!);
  await panel.getByLabel('انتخاب رأس کاتر', { exact: true }).selectOption('1');
  const x = panel.getByRole('spinbutton', { name: 'مختصات افقی رأس کاتر (mm)', exact: true });
  await x.fill('60');
  await panel.getByRole('button', { name: 'اعمال مختصات رأس کاتر', exact: true }).click();
  await finish.click();
  await expect(output).toBeEnabled();
  await undo.click();
  await expect(x).toHaveValue('40');
  await expect(output).toBeDisabled();
  await expect(save).toBeDisabled();
  await finish.click();
  const backDownload = page.waitForEvent('download');
  await output.click();
  expect(await readFile((await (await backDownload).path())!)).toEqual(before);
  await canvas.focus();
  await page.keyboard.press('Control+Shift+z');
  await expect(x).toHaveValue('60');
  await expect(output).toBeDisabled();
  await panel.getByRole('button', { name: 'حالت جابه‌جایی رأس با کشیدن', exact: true }).click();
  const move = async (a: number, b: number) => {
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(
      box.x + ((a + 5.3) / 160) * box.width,
      box.y + ((b + 5.3) / 160) * box.height,
    );
  };
  await move(60, 0);
  await page.mouse.down();
  await expect(undo).toBeDisabled();
  for (const a of [61, 62, 65, 70]) await move(a, 0);
  await page.mouse.up();
  await expect(x).toHaveValue('70');
  await undo.click();
  await expect(x).toHaveValue('60');
  await redo.click();
  await expect(x).toHaveValue('70');
  // Cancelled drag must not create a second edit.
  await move(70, 0);
  await page.mouse.down();
  await move(80, 0);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await undo.click();
  await expect(x).toHaveValue('60');
  await panel.getByRole('button', { name: 'پاک‌کردن نقاط کاتر', exact: true }).click();
  await expect(panel.getByLabel('انتخاب رأس کاتر', { exact: true })).toHaveCount(0);
  await undo.click();
  await expect(x).toHaveValue('60');
  await expect(redo).toBeEnabled();
  await x.fill('61.25');
  await panel.getByRole('button', { name: 'اعمال مختصات رأس کاتر', exact: true }).click();
  await expect(redo).toBeDisabled();
  await canvas.focus();
  await page.keyboard.press('Control+z');
  await expect(x).toHaveValue('60');
  await page.keyboard.press('Control+y');
  await expect(x).toHaveValue('61.25');
  await expect(output).toBeDisabled();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeEnabled();
  await page.getByRole('button', { name: '🏺 فرم', exact: true }).click();
  await expect(projectWall).toHaveValue('7');
});

test('orthogonal cutter panel stays lazy, exports concave L/U STL and blocks obsolete or unsafe SVG geometry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const requests: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('OrthogonalCutterTool-')) requests.push(req.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await expect(panel.locator('summary')).toBeVisible();
  expect(requests).toHaveLength(0);
  await panel.locator('summary').click();
  const output = panel.getByRole('button', { name: 'دانلود STL کاتر قائم‌الزاویه', exact: true });
  await expect(output).toBeEnabled();
  expect(requests).toHaveLength(1);
  const download = async () => {
    const pending = page.waitForEvent('download');
    await output.click();
    const file = await pending;
    expect(file.suggestedFilename()).toMatch(/^orthogonal-cutter_ring_/);
    return await readFile((await file.path())!);
  };
  const initial = await download();
  expect(initial.readUInt32LE(80)).toBe(84);
  let maxX = 0,
    maxY = 0;
  for (let i = 0; i < 84; i++)
    for (let j = 0; j < 3; j++) {
      maxX = Math.max(maxX, Math.abs(initial.readFloatLE(84 + i * 50 + 12 + j * 12)));
      maxY = Math.max(maxY, initial.readFloatLE(84 + i * 50 + 16 + j * 12));
    }
  expect(maxX).toBeCloseTo(44.6, 3);
  expect(maxY).toBe(20);
  await expect(panel).toContainText('۸۰ × ۸۰ mm');
  await panel
    .getByRole('button', { name: 'بازیابی نمونهٔ U کاتر قائم‌الزاویه', exact: true })
    .click();
  expect((await download()).readUInt32LE(80)).toBe(112);
  await expect(panel).toContainText('۱۰۰ × ۱۰۰ mm');
  const input = panel.getByLabel('ورود SVG کاتر قائم‌الزاویه', { exact: true });
  const upload = async (svg: string) => {
    await expect(input).toBeEnabled();
    await input.setInputFiles({
      name: 'shape.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(svg),
    });
  };
  const source = (points: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><polygon points="${points}"/></svg>`;
  const scaled =
    '<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="80mm" viewBox="10 20 40 40"><polygon points="10,20 50,20 50,35 25,35 25,60 10,60"/></svg>';
  await upload(scaled);
  await expect(output).toBeEnabled();
  expect(await download()).toEqual(initial);
  // A notch valid at default wall is deliberately blocked at the wider grip, without fallback.
  await upload(source('0,0 100,0 100,100 58,100 58,40 42,40 42,100 0,100'));
  await expect(output).toBeEnabled();
  const wall = panel.getByRole('spinbutton', {
    name: 'ضخامت دیوارهٔ کاتر قائم‌الزاویه',
    exact: true,
  });
  await wall.fill('3');
  await wall.press('Enter');
  await expect(output).toBeDisabled();
  await expect(panel.getByRole('img')).toHaveCount(0);
  await wall.fill('0.8');
  await wall.press('Enter');
  await expect(output).toBeEnabled();
  for (const svg of [
    source('0,0 80,0 80,80 43,80 43,30 37,30 37,80 0,80'),
    source('0,0 80,0 80,80 30,30 0,80'),
    scaled.replace('</svg>', '<polygon points="20,25 30,25 30,30 20,30"/></svg>'),
    scaled.replace('80mm', '80px'),
    '<svg/>',
  ]) {
    await upload(svg);
    await expect(panel.getByRole('alert')).toContainText('SVG قائم‌الزاویه پشتیبانی نشد');
    await expect(output).toBeDisabled();
    await expect(panel.getByRole('img')).toHaveCount(0);
  }
  await panel
    .getByRole('button', { name: 'بازیابی نمونهٔ L کاتر قائم‌الزاویه', exact: true })
    .click();
  await expect(output).toBeEnabled();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  const tip = panel.getByRole('spinbutton', { name: 'ضخامت لبهٔ کاتر قائم‌الزاویه', exact: true });
  await tip.fill('1.2');
  await tip.press('Enter');
  await expect(output).toBeDisabled();
  await tip.fill('0.6');
  await tip.press('Enter');
  await expect(output).toBeEnabled();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('orthogonal cutter sample recovery cancels delayed SVG reads without reviving the old contour', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function () {
      if (this.name !== 'delayed-ortho.svg') return original.call(this);
      const file = this;
      return new Promise<string>((resolve) => {
        (window as unknown as { releaseOrtho: () => Promise<void> }).releaseOrtho = async () =>
          resolve(await original.call(file));
      });
    };
  });
  const output = panel.getByRole('button', { name: 'دانلود STL کاتر قائم‌الزاویه', exact: true });
  const input = panel.getByLabel('ورود SVG کاتر قائم‌الزاویه', { exact: true });
  await expect(output).toBeEnabled();
  await input.setInputFiles({
    name: 'delayed-ortho.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="80mm" viewBox="0 0 80 80"><polygon points="0,0 80,0 80,30 30,30 30,80 0,80"/></svg>',
    ),
  });
  await expect(output).toBeDisabled();
  await expect(input).toBeDisabled();
  await expect(
    panel.getByRole('status', { name: 'اعتبار هندسهٔ کاتر قائم‌الزاویه', exact: true }),
  ).toContainText('در حال بررسی');
  await panel
    .getByRole('button', { name: 'بازیابی نمونهٔ U کاتر قائم‌الزاویه', exact: true })
    .click();
  await expect(output).toBeEnabled();
  await expect(panel).toContainText('۱۰۰ × ۱۰۰ mm');
  await page.evaluate(async () => {
    await (window as unknown as { releaseOrtho: () => Promise<void> }).releaseOrtho();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
  await expect(panel).toContainText('۱۰۰ × ۱۰۰ mm');
  await expect(output).toBeEnabled();
  await expect(panel.getByRole('alert')).toHaveCount(0);
});

test('orthogonal cutter files and SVG round trip geometry and settings without broadening convex files', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  const stl = panel.getByRole('button', { name: 'دانلود STL کاتر قائم‌الزاویه', exact: true });
  const fileSave = panel.getByRole('button', {
    name: 'ذخیرهٔ فایل مستقل کاتر قائم‌الزاویه',
    exact: true,
  });
  const svgSave = panel.getByRole('button', {
    name: 'دانلود SVG مرز کاتر قائم‌الزاویه',
    exact: true,
  });
  const fileInput = panel.getByLabel('بازکردن فایل مستقل کاتر قائم‌الزاویه', { exact: true });
  const download = async (name: string) => {
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name, exact: true }).click();
    const file = await pending;
    return { bytes: await readFile((await file.path())!), name: file.suggestedFilename() };
  };
  const height = panel.getByRole('spinbutton', { name: 'ارتفاع کاتر قائم‌الزاویه', exact: true });
  const wall = panel.getByRole('spinbutton', {
    name: 'ضخامت دیوارهٔ کاتر قائم‌الزاویه',
    exact: true,
  });
  const tip = panel.getByRole('spinbutton', { name: 'ضخامت لبهٔ کاتر قائم‌الزاویه', exact: true });
  await height.fill('25');
  await height.press('Enter');
  await wall.fill('2');
  await wall.press('Enter');
  await tip.fill('0.8');
  await tip.press('Enter');
  const before = await download('دانلود STL کاتر قائم‌الزاویه');
  const file = await download('ذخیرهٔ فایل مستقل کاتر قائم‌الزاویه');
  expect(file.name).toBe('patturn-orthogonal-cutter.orthogonal.json');
  const svg = await download('دانلود SVG مرز کاتر قائم‌الزاویه');
  expect(svg.name).toMatch(/\.svg$/);
  expect(svg.bytes.toString()).toContain('width="80mm"');
  await panel
    .getByRole('button', { name: 'بازیابی نمونهٔ U کاتر قائم‌الزاویه', exact: true })
    .click();
  await height.fill('30');
  await height.press('Enter');
  await fileInput.setInputFiles({
    name: file.name,
    mimeType: 'application/json',
    buffer: file.bytes,
  });
  await expect(height).toHaveValue('25');
  await expect(wall).toHaveValue('2');
  await expect(tip).toHaveValue('0.8');
  await expect(stl).toBeEnabled();
  expect((await download('دانلود STL کاتر قائم‌الزاویه')).bytes).toEqual(before.bytes);
  await panel
    .getByRole('button', { name: 'بازیابی نمونهٔ U کاتر قائم‌الزاویه', exact: true })
    .click();
  await panel
    .getByLabel('ورود SVG کاتر قائم‌الزاویه', { exact: true })
    .setInputFiles({ name: svg.name, mimeType: 'image/svg+xml', buffer: svg.bytes });
  await expect(stl).toBeEnabled();
  expect((await download('دانلود STL کاتر قائم‌الزاویه')).bytes).toEqual(before.bytes);
  const doc = JSON.parse(file.bytes.toString());
  for (const bad of [
    { ...doc, version: 2 },
    { ...doc, unknown: true },
    { ...doc, format: 'patturn-cutter' },
    { ...doc, units: 'cm' },
  ]) {
    await fileInput.setInputFiles({
      name: 'bad.orthogonal.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(bad)),
    });
    await expect(panel.getByRole('alert')).toContainText('فایل مستقل قائم‌الزاویه نامعتبر');
    await expect(stl).toBeDisabled();
    await expect(fileSave).toBeDisabled();
    await expect(svgSave).toBeDisabled();
    await expect(height).toHaveValue('25');
  }
  await fileInput.setInputFiles({
    name: file.name,
    mimeType: 'application/json',
    buffer: file.bytes,
  });
  await expect(stl).toBeEnabled();
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function () {
      if (this.name !== 'delayed-ortho.json') return original.call(this);
      const file = this;
      return new Promise<string>((resolve) => {
        (window as unknown as { releaseOrthoFile: () => Promise<void> }).releaseOrthoFile =
          async () => resolve(await original.call(file));
      });
    };
  });
  await fileInput.setInputFiles({
    name: 'delayed-ortho.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...doc, heightMm: 39 })),
  });
  await expect(stl).toBeDisabled();
  await expect(fileSave).toBeDisabled();
  await expect(svgSave).toBeDisabled();
  await panel
    .getByRole('button', { name: 'بازیابی نمونهٔ U کاتر قائم‌الزاویه', exact: true })
    .click();
  await page.evaluate(async () => {
    await (window as unknown as { releaseOrthoFile: () => Promise<void> }).releaseOrthoFile();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
  await expect(height).toHaveValue('25');
  await expect(panel).toContainText('۱۰۰ × ۱۰۰ mm');
  await expect(stl).toBeEnabled();
  // The original convex file input must reject this separate contract, without touching the child tool.
  await page
    .locator('.cookie-cutter-tool')
    .getByLabel('بازکردن فایل مستقل کاتر', { exact: true })
    .setInputFiles({ name: file.name, mimeType: 'application/json', buffer: file.bytes });
  await expect(
    page.locator('.cookie-cutter-tool').getByRole('alert').filter({ hasText: 'فایل کاتر نامعتبر' }),
  ).toBeVisible();
  await expect(stl).toBeEnabled();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('orthogonal corner edits slide neighbors, block drafts and round trip the changed concavity', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  const selection = panel.getByLabel('انتخاب گوشهٔ کاتر قائم‌الزاویه', { exact: true });
  const x = panel.getByRole('spinbutton', {
    name: 'مختصات افقی گوشهٔ قائم‌الزاویه (mm)',
    exact: true,
  });
  const y = panel.getByRole('spinbutton', {
    name: 'مختصات عمودی گوشهٔ قائم‌الزاویه (mm)',
    exact: true,
  });
  const apply = panel.getByRole('button', { name: 'اعمال گوشهٔ قائم‌الزاویه', exact: true });
  const cancel = panel.getByRole('button', { name: 'لغو ویرایش گوشهٔ قائم‌الزاویه', exact: true });
  const outputs = [
    'دانلود STL کاتر قائم‌الزاویه',
    'دانلود SVG مرز کاتر قائم‌الزاویه',
    'ذخیرهٔ فایل مستقل کاتر قائم‌الزاویه',
  ];
  const download = async (name: string) => {
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name, exact: true }).click();
    return await readFile((await (await pending).path())!);
  };
  const original = await download(outputs[0]!);
  await selection.selectOption('3');
  await x.fill('40.25');
  await y.fill('40.5');
  await expect(selection).toBeDisabled();
  for (const name of outputs)
    await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled();
  await expect(panel.getByRole('img')).toHaveCount(0);
  await apply.click();
  await expect(selection).toBeEnabled();
  await expect(panel.getByRole('button', { name: outputs[0]!, exact: true })).toBeEnabled();
  const edited = await download(outputs[0]!);
  expect(edited).not.toEqual(original);
  expect(edited.readUInt32LE(80)).toBe(84);
  await selection.selectOption('2');
  await expect(y).toHaveValue('40.5');
  await selection.selectOption('4');
  await expect(x).toHaveValue('40.25');
  await selection.selectOption('3');
  for (const [a, b] of [
    ['75', '75'],
    ['', '40.5'],
    ['1001', '40.5'],
  ]) {
    await x.fill(a!);
    await y.fill(b!);
    await apply.click();
    await expect(panel.getByRole('alert')).toContainText('ویرایش پذیرفته نشد');
    for (const name of outputs)
      await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled();
    await cancel.click();
    await expect(x).toHaveValue('40.25');
    await expect(y).toHaveValue('40.5');
    await expect(selection).toBeEnabled();
    await expect(panel.getByRole('button', { name: outputs[0]!, exact: true })).toBeEnabled();
  }
  const file = await download(outputs[2]!);
  const doc = JSON.parse(file.toString());
  expect(doc.points[3]).toEqual([0.25, 0.5]);
  // Replacing a pending draft must reset the editor and never keep its unsaved coordinates.
  await x.fill('50');
  await panel
    .getByLabel('بازکردن فایل مستقل کاتر قائم‌الزاویه', { exact: true })
    .setInputFiles({ name: 'edited.orthogonal.json', mimeType: 'application/json', buffer: file });
  await expect(selection).toBeEnabled();
  await selection.selectOption('3');
  await expect(x).toHaveValue('0.25');
  await expect(y).toHaveValue('0.5');
  expect(await download(outputs[0]!)).toEqual(edited);
  await x.fill('55');
  await panel
    .getByRole('button', { name: 'بازیابی نمونهٔ U کاتر قائم‌الزاویه', exact: true })
    .click();
  await expect(selection).toBeEnabled();
  await expect(x).toHaveValue('0');
  await expect(panel).toContainText('۱۰۰ × ۱۰۰ mm');
  await expect(panel.getByRole('button', { name: outputs[0]!, exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('orthogonal local history restores contours under current dimensions, drops drafts and resets on file import', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  const projectWall = page.getByRole('spinbutton', { name: 'ضخامت شعاعی برای ظرفیت', exact: true });
  await projectWall.fill('7');
  await projectWall.press('Enter');
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeEnabled();
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  const undo = panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true });
  const redo = panel.getByRole('button', { name: 'بازانجام ویرایش قائم‌الزاویه', exact: true });
  const scope = panel.getByRole('group', {
    name: 'ناحیهٔ ویرایش و تاریخچهٔ کاتر قائم‌الزاویه',
    exact: true,
  });
  const input = panel.getByLabel('بازکردن فایل مستقل کاتر قائم‌الزاویه', { exact: true });
  const doc = {
    format: 'patturn-orthogonal-cutter',
    version: 1,
    units: 'mm',
    heightMm: 20,
    wallMm: 1.6,
    tipMm: 0.6,
    points: [
      [0, 0],
      [100, 0],
      [100, 100],
      [58, 100],
      [58, 40],
      [42, 40],
      [42, 100],
      [0, 100],
    ],
  };
  const upload = async () => {
    await input.setInputFiles({
      name: 'notch.orthogonal.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
  };
  await upload();
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await scope.focus();
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeEnabled();
  const selection = panel.getByLabel('انتخاب گوشهٔ کاتر قائم‌الزاویه', { exact: true });
  const x = panel.getByRole('spinbutton', {
    name: 'مختصات افقی گوشهٔ قائم‌الزاویه (mm)',
    exact: true,
  });
  const apply = panel.getByRole('button', { name: 'اعمال گوشهٔ قائم‌الزاویه', exact: true });
  await selection.selectOption('4');
  await x.fill('64');
  await apply.click();
  await expect(undo).toBeEnabled();
  const wall = panel.getByRole('spinbutton', {
    name: 'ضخامت دیوارهٔ کاتر قائم‌الزاویه',
    exact: true,
  });
  await wall.fill('3');
  await wall.press('Enter');
  const output = panel.getByRole('button', { name: 'دانلود STL کاتر قائم‌الزاویه', exact: true });
  await expect(output).toBeEnabled();
  const pending = page.waitForEvent('download');
  await output.click();
  const original = await readFile((await (await pending).path())!);
  await x.fill('65');
  await expect(selection).toBeDisabled();
  await undo.click();
  await expect(selection).toBeEnabled();
  await expect(wall).toHaveValue('3');
  for (const name of [
    'دانلود STL کاتر قائم‌الزاویه',
    'دانلود SVG مرز کاتر قائم‌الزاویه',
    'ذخیرهٔ فایل مستقل کاتر قائم‌الزاویه',
  ])
    await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled();
  await scope.focus();
  await page.keyboard.press('Control+Shift+z');
  await expect(output).toBeEnabled();
  await selection.selectOption('4');
  await expect(x).toHaveValue('64');
  const restored = page.waitForEvent('download');
  await output.click();
  expect(await readFile((await (await restored).path())!)).toEqual(original);
  await scope.focus();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+y');
  await expect(output).toBeEnabled();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeEnabled();
  // Sample changes are edits; input values alone and cancelled drafts are not.
  await panel
    .getByRole('button', { name: 'بازیابی نمونهٔ L کاتر قائم‌الزاویه', exact: true })
    .click();
  await expect(panel).toContainText('۸۰ × ۸۰ mm');
  await undo.click();
  await expect(panel).toContainText('۱۰۰ × ۱۰۰ mm');
  await expect(redo).toBeEnabled();
  await selection.selectOption('4');
  await x.fill('66');
  await apply.click();
  await expect(redo).toBeDisabled();
  await upload();
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await expect(wall).toHaveValue('1.6');
  await expect(output).toBeEnabled();
  await page.getByRole('button', { name: '🏺 فرم', exact: true }).click();
  await expect(projectWall).toHaveValue('7');
});

test('orthogonal rectangular notch insertion and removal are validated, undoable and preserved in files', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  const outputs = [
    'دانلود STL کاتر قائم‌الزاویه',
    'دانلود SVG مرز کاتر قائم‌الزاویه',
    'ذخیرهٔ فایل مستقل کاتر قائم‌الزاویه',
  ];
  const download = async (name: string) => {
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name, exact: true }).click();
    return await readFile((await (await pending).path())!);
  };
  const original = await download(outputs[0]!);
  await panel
    .getByRole('button', { name: 'حالت افزودن و حذف فرورفتگی یا بیرون‌زدگی مستطیلی', exact: true })
    .click();
  const selection = panel.getByLabel('انتخاب شروع ضلع یا فرورفتگی', { exact: true });
  const width = panel.getByRole('spinbutton', { name: 'عرض فرورفتگی روی ضلع (mm)', exact: true });
  const add = panel.getByRole('button', { name: 'افزودن چهار گوشهٔ فرورفتگی', exact: true });
  const remove = panel.getByRole('button', { name: 'حذف چهار گوشهٔ فرورفتگی', exact: true });
  const cancel = panel.getByRole('button', { name: 'لغو پیش‌نویس فرورفتگی', exact: true });
  await add.click();
  await expect(selection.locator('option')).toHaveCount(10);
  const changed = await download(outputs[0]!);
  expect(changed.readUInt32LE(80)).toBe(140);
  expect(changed).not.toEqual(original);
  const file = await download(outputs[2]!);
  await selection.selectOption('1');
  await remove.click();
  await expect(selection.locator('option')).toHaveCount(6);
  expect(await download(outputs[0]!)).toEqual(original);
  await panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true }).click();
  await expect(selection.locator('option')).toHaveCount(10);
  expect(await download(outputs[0]!)).toEqual(changed);
  await panel.getByRole('button', { name: 'بازانجام ویرایش قائم‌الزاویه', exact: true }).click();
  await expect(selection.locator('option')).toHaveCount(6);
  await remove.click();
  await expect(panel.getByRole('alert')).toContainText('فرورفتگی پذیرفته نشد');
  for (const name of outputs)
    await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled();
  await cancel.click();
  expect(await download(outputs[0]!)).toEqual(original);
  await width.fill('6');
  for (const name of outputs)
    await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled();
  await add.click();
  await expect(panel.getByRole('alert')).toContainText('فرورفتگی پذیرفته نشد');
  await expect(selection.locator('option')).toHaveCount(6);
  await cancel.click();
  await panel
    .getByLabel('بازکردن فایل مستقل کاتر قائم‌الزاویه', { exact: true })
    .setInputFiles({ name: 'notched.orthogonal.json', mimeType: 'application/json', buffer: file });
  await expect(selection.locator('option')).toHaveCount(10);
  expect(await download(outputs[0]!)).toEqual(changed);
  await selection.selectOption('1');
  await remove.click();
  expect(await download(outputs[0]!)).toEqual(original);
  await width.fill('5');
  await panel
    .getByRole('button', { name: 'حالت افزودن و حذف فرورفتگی یا بیرون‌زدگی مستطیلی', exact: true })
    .click();
  await expect(panel.getByRole('button', { name: outputs[0]!, exact: true })).toBeEnabled();
  await expect(panel.getByLabel('انتخاب گوشهٔ کاتر قائم‌الزاویه', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('orthogonal corner dragging validates release, groups history and cancels captured gestures', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  const mode = panel.getByRole('button', { name: 'حالت کشیدن گوشهٔ قائم‌الزاویه', exact: true });
  await mode.click();
  const canvas = panel.getByRole('img', {
    name: 'صفحهٔ کشیدن گوشه‌های کاتر قائم‌الزاویه',
    exact: true,
  });
  const output = panel.getByRole('button', { name: 'دانلود STL کاتر قائم‌الزاویه', exact: true });
  const undo = panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true });
  const redo = panel.getByRole('button', { name: 'بازانجام ویرایش قائم‌الزاویه', exact: true });
  const download = async () => {
    const pending = page.waitForEvent('download');
    await output.click();
    return await readFile((await (await pending).path())!);
  };
  const original = await download();
  const move = async (x: number, y: number) => {
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(
      box.x + ((x + 20.3) / 120) * box.width,
      box.y + ((y + 20.3) / 120) * box.height,
    );
  };
  await move(65, 65);
  await page.mouse.down();
  await page.mouse.up();
  await expect(output).toBeEnabled();
  await expect(undo).toBeDisabled();
  await move(30, 30);
  await page.mouse.down();
  await expect(output).toBeDisabled();
  await expect(mode).toBeDisabled();
  await expect(
    panel.getByRole('spinbutton', { name: 'ارتفاع کاتر قائم‌الزاویه', exact: true }),
  ).toBeDisabled();
  await expect(panel.getByLabel('ورود SVG کاتر قائم‌الزاویه', { exact: true })).toBeDisabled();
  for (const p of [32, 35, 40]) await move(p, p);
  await page.mouse.up();
  await expect(output).toBeEnabled();
  const edited = await download();
  expect(edited).not.toEqual(original);
  await undo.click();
  expect(await download()).toEqual(original);
  await expect(undo).toBeDisabled();
  await redo.click();
  expect(await download()).toEqual(edited);
  await undo.click();
  // Invalid release is not a partial commit of the last valid preview.
  await move(30, 30);
  await page.mouse.down();
  await move(40, 40);
  await move(75, 75);
  await page.mouse.up();
  await expect(panel.getByRole('alert')).toContainText('محل رهاکردن معتبر نبود');
  await expect(output).toBeDisabled();
  await expect(undo).toBeDisabled();
  await panel.getByRole('button', { name: 'لغو حرکت گوشهٔ قائم‌الزاویه', exact: true }).click();
  expect(await download()).toEqual(original);
  await expect(redo).toBeEnabled();
  await move(30, 30);
  await page.mouse.down();
  await move(40, 40);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await download()).toEqual(original);
  await expect(undo).toBeDisabled();
  await expect(redo).toBeEnabled();
  // A newer pointer-up position must override the last valid move preview.
  await move(30, 30);
  await page.mouse.down();
  await move(40, 40);
  const releaseBox = (await canvas.boundingBox())!;
  await canvas.dispatchEvent('pointerup', {
    pointerId: 1,
    isPrimary: true,
    pointerType: 'mouse',
    clientX: releaseBox.x + (95 / 120) * releaseBox.width,
    clientY: releaseBox.y + (95 / 120) * releaseBox.height,
  });
  await page.mouse.up();
  await expect(output).toBeDisabled();
  await expect(undo).toBeDisabled();
  await panel.getByRole('button', { name: 'لغو حرکت گوشهٔ قائم‌الزاویه', exact: true }).click();
  // Releasing outside the frame still reaches the captured SVG and cannot bypass validation.
  await move(30, 30);
  await page.mouse.down();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width + 40, box.y + box.height + 40);
  await page.mouse.up();
  await expect(output).toBeDisabled();
  await panel.getByRole('button', { name: 'لغو حرکت گوشهٔ قائم‌الزاویه', exact: true }).click();
  await expect(output).toBeEnabled();
  await move(30, 30);
  await page.mouse.down();
  await move(40, 40);
  await canvas.dispatchEvent('pointercancel', {
    pointerId: 1,
    isPrimary: true,
    pointerType: 'mouse',
  });
  await page.mouse.up();
  expect(await download()).toEqual(original);
  await expect(undo).toBeDisabled();
  await expect(mode).toBeEnabled();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('explicit pixel-boundary tracing feeds the live orthogonal cutter without dropping holes or repairing default chamfers', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('OrthogonalCutterTool-')) requests.push(req.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('ردیابی تصویر — Otsu و کانتور', { exact: true }).click();
  const trace = page.locator('.image-trace-tool');
  const pixel = trace.getByRole('checkbox', {
    name: 'ردیابی مرز پیکسلی قائم‌الزاویه',
    exact: true,
  });
  await pixel.check();
  await expect(
    trace.getByRole('spinbutton', { name: 'خطای ساده‌سازی ردیابی', exact: true }),
  ).toHaveCount(0);
  const picture = async (kind: 'L' | 'hole' | 'diagonal') =>
    await page.evaluate((kind) => {
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 96;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 96, 96);
      ctx.fillStyle = 'black';
      if (kind === 'diagonal') {
        ctx.fillRect(16, 16, 1, 1);
        ctx.fillRect(17, 17, 1, 1);
      } else {
        ctx.fillRect(16, 16, 64, 24);
        ctx.fillRect(16, 16, 24, 64);
        if (kind === 'hole') {
          ctx.fillStyle = 'white';
          ctx.fillRect(22, 22, 10, 10);
        }
      }
      return canvas.toDataURL('image/png').split(',')[1]!;
    }, kind);
  const upload = async (kind: 'L' | 'hole' | 'diagonal') =>
    await trace.getByLabel('تصویر ردیابی', { exact: true }).setInputFiles({
      name: `${kind}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(await picture(kind), 'base64'),
    });
  await upload('L');
  await expect(trace.getByRole('status').filter({ hasText: 'کانتور؛' })).toContainText('۱ کانتور');
  expect(requests).toHaveLength(0);
  const panel = trace.locator('.traced-orthogonal-cutter-tool');
  await panel.locator('summary').click();
  const output = panel.getByRole('button', { name: 'دانلود STL کاتر قائم‌الزاویه', exact: true });
  await expect(output).toBeEnabled();
  expect(requests).toHaveLength(1);
  await expect(
    panel.getByRole('button', { name: 'بازیابی نمونهٔ L کاتر قائم‌الزاویه', exact: true }),
  ).toHaveCount(0);
  await expect(
    panel.getByLabel('بازکردن فایل مستقل کاتر قائم‌الزاویه', { exact: true }),
  ).toHaveCount(0);
  await expect(panel.getByLabel('انتخاب گوشهٔ کاتر قائم‌الزاویه', { exact: true })).toHaveCount(0);
  const download = async (name: string) => {
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name, exact: true }).click();
    return await readFile((await (await pending).path())!);
  };
  const maxX = (bytes: Buffer) => {
    let x = 0;
    for (let i = 0; i < bytes.readUInt32LE(80); i++)
      for (let j = 0; j < 3; j++)
        x = Math.max(x, Math.abs(bytes.readFloatLE(84 + i * 50 + 12 + j * 12)));
    return x;
  };
  const initial = await download('دانلود STL کاتر قائم‌الزاویه');
  expect(initial.readUInt32LE(80)).toBe(84);
  expect(maxX(initial)).toBeCloseTo(100 / 3 + 4.6, 3);
  const saved = JSON.parse((await download('ذخیرهٔ فایل مستقل کاتر قائم‌الزاویه')).toString());
  expect(saved.format).toBe('patturn-orthogonal-cutter');
  expect(saved.points).toHaveLength(6);
  const width = trace.getByRole('spinbutton', { name: 'عرض مرجع تصویر', exact: true });
  await width.fill('80');
  await width.press('Enter');
  expect(maxX(await download('دانلود STL کاتر قائم‌الزاویه'))).toBeCloseTo(80 / 3 + 4.6, 3);
  await width.fill('20');
  await width.press('Enter');
  await expect(output).toBeDisabled();
  await expect(
    panel.getByRole('button', { name: 'دانلود SVG مرز کاتر قائم‌الزاویه', exact: true }),
  ).toBeDisabled();
  await width.fill('100');
  await width.press('Enter');
  await expect(output).toBeEnabled();
  await pixel.uncheck();
  await expect(output).toBeDisabled();
  await expect(
    trace.getByRole('spinbutton', { name: 'خطای ساده‌سازی ردیابی', exact: true }),
  ).toBeVisible();
  await pixel.check();
  await expect(output).toBeEnabled();
  await upload('hole');
  await expect(trace.getByRole('status').filter({ hasText: 'کانتور؛' })).toContainText('۲ کانتور');
  await panel.locator('summary').click();
  await expect(output).toBeDisabled();
  await expect(
    panel.getByRole('status', { name: 'اعتبار هندسهٔ کاتر قائم‌الزاویه', exact: true }),
  ).toContainText('دقیقاً یک کانتور');
  await upload('diagonal');
  await expect(trace.getByRole('alert').filter({ hasText: 'تماس قطری مبهم' })).toBeVisible();
  await expect(panel).toHaveCount(0);
  await upload('L');
  await expect(trace.getByRole('status').filter({ hasText: 'کانتور؛' })).toContainText('۱ کانتور');
  await panel.locator('summary').click();
  await expect(output).toBeEnabled();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('orthogonal outward tabs are validated, undoable and preserved in files', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  const outputs = [
    'دانلود STL کاتر قائم‌الزاویه',
    'دانلود SVG مرز کاتر قائم‌الزاویه',
    'ذخیرهٔ فایل مستقل کاتر قائم‌الزاویه',
  ];
  const download = async (name: string) => {
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name, exact: true }).click();
    return await readFile((await (await pending).path())!);
  };
  const original = await download(outputs[0]!);
  await panel
    .getByRole('button', { name: 'حالت افزودن و حذف فرورفتگی یا بیرون‌زدگی مستطیلی', exact: true })
    .click();
  await panel.getByLabel('جهت عملیات مستطیلی', { exact: true }).selectOption('outward');
  const selection = panel.getByLabel('انتخاب شروع ضلع یا بیرون‌زدگی', { exact: true });
  const width = panel.getByRole('spinbutton', { name: 'عرض بیرون‌زدگی روی ضلع (mm)', exact: true });
  const add = panel.getByRole('button', { name: 'افزودن چهار گوشهٔ بیرون‌زدگی', exact: true });
  const remove = panel.getByRole('button', { name: 'حذف چهار گوشهٔ بیرون‌زدگی', exact: true });
  const cancel = panel.getByRole('button', { name: 'لغو پیش‌نویس بیرون‌زدگی', exact: true });
  await add.click();
  await expect(selection.locator('option')).toHaveCount(10);
  const changed = await download(outputs[0]!);
  expect(changed.readUInt32LE(80)).toBe(140);
  expect(changed).not.toEqual(original);
  const file = await download(outputs[2]!);
  await panel.getByLabel('جهت عملیات مستطیلی', { exact: true }).selectOption('inward');
  await panel.getByLabel('انتخاب شروع ضلع یا فرورفتگی', { exact: true }).selectOption('1');
  await panel.getByRole('button', { name: 'حذف چهار گوشهٔ فرورفتگی', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('فرورفتگی پذیرفته نشد');
  for (const name of outputs)
    await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled();
  await panel.getByLabel('جهت عملیات مستطیلی', { exact: true }).selectOption('outward');
  expect(await download(outputs[0]!)).toEqual(changed);
  await selection.selectOption('1');
  await remove.click();
  await expect(selection.locator('option')).toHaveCount(6);
  expect(await download(outputs[0]!)).toEqual(original);
  await panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true }).click();
  await expect(selection.locator('option')).toHaveCount(10);
  expect(await download(outputs[0]!)).toEqual(changed);
  await panel.getByRole('button', { name: 'بازانجام ویرایش قائم‌الزاویه', exact: true }).click();
  await expect(selection.locator('option')).toHaveCount(6);
  await remove.click();
  await expect(panel.getByRole('alert')).toContainText('بیرون‌زدگی پذیرفته نشد');
  for (const name of outputs)
    await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled();
  await cancel.click();
  expect(await download(outputs[0]!)).toEqual(original);
  await width.fill('6');
  for (const name of outputs)
    await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled();
  await add.click();
  await expect(panel.getByRole('alert')).toContainText('بیرون‌زدگی پذیرفته نشد');
  await expect(selection.locator('option')).toHaveCount(6);
  await cancel.click();
  await panel
    .getByLabel('بازکردن فایل مستقل کاتر قائم‌الزاویه', { exact: true })
    .setInputFiles({ name: 'tabbed.orthogonal.json', mimeType: 'application/json', buffer: file });
  await panel.getByLabel('جهت عملیات مستطیلی', { exact: true }).selectOption('outward');
  await expect(selection.locator('option')).toHaveCount(10);
  expect(await download(outputs[0]!)).toEqual(changed);
  await selection.selectOption('1');
  await remove.click();
  expect(await download(outputs[0]!)).toEqual(original);
  await width.fill('5');
  await panel
    .getByRole('button', { name: 'حالت افزودن و حذف فرورفتگی یا بیرون‌زدگی مستطیلی', exact: true })
    .click();
  await expect(panel.getByRole('button', { name: outputs[0]!, exact: true })).toBeEnabled();
  await expect(panel.getByLabel('انتخاب گوشهٔ کاتر قائم‌الزاویه', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('orthogonal exact rotations and reflections preserve files, local history and output guards', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  const download = async (name: string) => {
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name, exact: true }).click();
    return readFile((await (await pending).path())!);
  };
  const stl = 'دانلود STL کاتر قائم‌الزاویه',
    file = 'ذخیرهٔ فایل مستقل کاتر قائم‌الزاویه';
  const initial = JSON.parse((await download(file)).toString());
  initial.points = [
    [10.125, 20.25],
    [90.125, 20.25],
    [90.125, 50.25],
    [40.125, 50.25],
    [40.125, 80.25],
    [10.125, 80.25],
  ];
  await panel.getByLabel('بازکردن فایل مستقل کاتر قائم‌الزاویه', { exact: true }).setInputFiles({
    name: 'fractional.orthogonal.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(initial)),
  });
  const basePoints = JSON.parse((await download(file)).toString()).points as number[][];
  const before = await download(stl);
  const right = panel.getByRole('button', { name: 'چرخش کاتر ۹۰ درجه به راست', exact: true }),
    left = panel.getByRole('button', { name: 'چرخش کاتر ۹۰ درجه به چپ', exact: true }),
    mirror = panel.getByRole('button', { name: 'قرینهٔ افقی کاتر قائم‌الزاویه', exact: true });
  await right.click();
  const rotated = await download(stl);
  expect(rotated).not.toEqual(before);
  expect(rotated.readUInt32LE(80)).toBe(before.readUInt32LE(80));
  const rotatedFile = await download(file);
  expect(JSON.parse(rotatedFile.toString()).points).toEqual(
    basePoints.map(([x, y]: number[]) => [-y! || 0, x!]),
  );
  await panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true }).click();
  expect(await download(stl)).toEqual(before);
  await panel.getByRole('button', { name: 'بازانجام ویرایش قائم‌الزاویه', exact: true }).click();
  expect(await download(stl)).toEqual(rotated);
  await left.click();
  await mirror.click();
  expect(JSON.parse((await download(file)).toString()).points).toEqual(
    basePoints.map(([x, y]: number[]) => [-x! || 0, y!]).reverse(),
  );
  await mirror.click();
  await panel.getByLabel('بازکردن فایل مستقل کاتر قائم‌الزاویه', { exact: true }).setInputFiles({
    name: 'rotated.orthogonal.json',
    mimeType: 'application/json',
    buffer: rotatedFile,
  });
  await expect(
    panel.getByRole('spinbutton', { name: 'مختصات افقی گوشهٔ قائم‌الزاویه (mm)', exact: true }),
  ).toHaveValue('30');
  await expect(panel.getByRole('button', { name: stl, exact: true })).toBeEnabled();
  expect(await download(stl)).toEqual(rotated);
  await panel
    .getByRole('spinbutton', { name: 'مختصات افقی گوشهٔ قائم‌الزاویه (mm)', exact: true })
    .fill('15');
  await expect(right).toBeDisabled();
  await expect(panel.getByRole('button', { name: stl, exact: true })).toBeDisabled();
  await panel.getByRole('button', { name: 'لغو ویرایش گوشهٔ قائم‌الزاویه', exact: true }).click();
  await expect(right).toBeEnabled();
  expect(await download(stl)).toEqual(rotated);
  await panel.getByLabel('بازکردن فایل مستقل کاتر قائم‌الزاویه', { exact: true }).setInputFiles({
    name: 'bad.orthogonal.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{}'),
  });
  await expect(right).toBeDisabled();
  await expect(mirror).toBeDisabled();
  await expect(panel.getByRole('button', { name: stl, exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('orthogonal numerical drawing closes explicitly and commits one independent undoable contour', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  const outputs = [
    'دانلود STL کاتر قائم‌الزاویه',
    'دانلود SVG مرز کاتر قائم‌الزاویه',
    'ذخیرهٔ فایل مستقل کاتر قائم‌الزاویه',
  ];
  const download = async (name: string) => {
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name, exact: true }).click();
    return readFile((await (await pending).path())!);
  };
  const original = await download(outputs[0]!);
  const mode = panel.getByRole('button', {
    name: 'حالت رسم عددی کانتور قائم‌الزاویه',
    exact: true,
  });
  await mode.click();
  for (const name of outputs)
    await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled();
  await expect(
    panel.getByRole('button', { name: 'چرخش کاتر ۹۰ درجه به راست', exact: true }),
  ).toBeDisabled();
  const x = panel.getByRole('spinbutton', { name: 'مختصات افقی نقطهٔ رسم (mm)', exact: true }),
    y = panel.getByRole('spinbutton', { name: 'مختصات عمودی نقطهٔ رسم (mm)', exact: true });
  const add = async (px: number, py: number) => {
    await x.fill(String(px));
    await y.fill(String(py));
    await panel.getByRole('button', { name: 'افزودن نقطهٔ قائم‌الزاویه', exact: true }).click();
  };
  const list = panel
    .getByRole('list', { name: 'نقاط پیش‌نویس قائم‌الزاویه به ترتیب', exact: true })
    .getByRole('listitem');
  const close = panel.getByRole('button', {
    name: 'بستن و اعمال کانتور قائم‌الزاویه',
    exact: true,
  });
  await add(0, 0);
  await add(20, 20);
  await expect(panel.getByRole('alert')).toContainText('نقطه افزوده نشد');
  await expect(list).toHaveCount(1);
  for (const [px, py] of [
    [90, 0],
    [90, 30],
    [30, 30],
    [30, 60],
  ])
    await add(px!, py!);
  await close.click();
  await expect(panel.getByRole('alert')).toContainText('کانتور بسته پذیرفته نشد');
  for (const name of outputs)
    await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled();
  await add(0, 60);
  await close.click();
  await expect(mode).toHaveAttribute('aria-pressed', 'false');
  const drawn = await download(outputs[0]!);
  expect(drawn.readUInt32LE(80)).toBe(84);
  expect(drawn).not.toEqual(original);
  const file = await download(outputs[2]!);
  const doc = JSON.parse(file.toString());
  expect(doc.points).toHaveLength(6);
  expect(
    Math.max(...doc.points.map((p: number[]) => p[0]!)) -
      Math.min(...doc.points.map((p: number[]) => p[0]!)),
  ).toBe(90);
  await panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true }).click();
  expect(await download(outputs[0]!)).toEqual(original);
  await expect(
    panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true }),
  ).toBeDisabled();
  await panel.getByRole('button', { name: 'بازانجام ویرایش قائم‌الزاویه', exact: true }).click();
  expect(await download(outputs[0]!)).toEqual(drawn);
  await mode.click();
  await add(10.25, 10.125);
  await panel.getByRole('button', { name: 'حذف آخرین نقطهٔ رسم', exact: true }).click();
  await expect(list).toHaveCount(0);
  await expect(close).toBeDisabled();
  await add(15, 15);
  await panel.getByRole('button', { name: 'پاک‌کردن نقاط رسم', exact: true }).click();
  await expect(list).toHaveCount(0);
  await panel.getByRole('button', { name: 'لغو رسم و حفظ کانتور قبلی', exact: true }).click();
  expect(await download(outputs[0]!)).toEqual(drawn);
  await mode.click();
  await add(5, 5);
  await panel
    .getByLabel('بازکردن فایل مستقل کاتر قائم‌الزاویه', { exact: true })
    .setInputFiles({ name: 'drawn.orthogonal.json', mimeType: 'application/json', buffer: file });
  await expect(mode).toHaveAttribute('aria-pressed', 'false');
  expect(await download(outputs[0]!)).toEqual(drawn);
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('orthogonal sketch pointer and keyboard share millimetres without implicit elbows or stale exports', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  const mode = panel.getByRole('button', {
    name: 'حالت رسم عددی کانتور قائم‌الزاویه',
    exact: true,
  });
  await mode.click();
  const canvas = panel.getByRole('group', { name: 'پلان باز پیش‌نویس قائم‌الزاویه', exact: true });
  const items = panel
    .getByRole('list', { name: 'نقاط پیش‌نویس قائم‌الزاویه به ترتیب', exact: true })
    .getByRole('listitem');
  const click = async (x: number, y: number, button: 'left' | 'right' = 'left') => {
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    const size = Math.min(box.width, box.height);
    await page.mouse.click(
      Math.round(box.x + (box.width - size) / 2 + ((x + 5) * size) / 160),
      Math.round(box.y + (box.height - size) / 2 + ((y + 5) * size) / 160),
      { button },
    );
  };
  await click(10, 10);
  await click(20, 20);
  await expect(panel.getByRole('alert')).toContainText('نقطه افزوده نشد');
  await expect(items).toHaveCount(1);
  await click(-2, 50);
  await expect(panel.getByRole('alert')).toContainText('کلیک در محدوده');
  await expect(items).toHaveCount(1);
  await click(90, 10);
  await click(90, 30);
  await page.setViewportSize({ width: 1100, height: 900 });
  await click(30, 30);
  await click(30, 80);
  await click(10, 80);
  await expect(items).toHaveText([
    '۱۰، ۱۰ mm',
    '۹۰، ۱۰ mm',
    '۹۰، ۳۰ mm',
    '۳۰، ۳۰ mm',
    '۳۰، ۸۰ mm',
    '۱۰، ۸۰ mm',
  ]);
  await expect(items).toHaveCount(6);
  await expect(
    panel.getByRole('button', { name: 'دانلود STL کاتر قائم‌الزاویه', exact: true }),
  ).toBeDisabled();
  await panel
    .getByRole('button', { name: 'بستن و اعمال کانتور قائم‌الزاویه', exact: true })
    .click();
  const download = async () => {
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'دانلود STL کاتر قائم‌الزاویه', exact: true }).click();
    return readFile((await (await pending).path())!);
  };
  const pointer = await download();
  expect(pointer.readUInt32LE(80)).toBe(84);
  await page.setViewportSize({ width: 320, height: 900 });
  await mode.click();
  await canvas.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(
    panel.getByRole('spinbutton', { name: 'مختصات افقی نقطهٔ رسم (mm)', exact: true }),
  ).toHaveValue('0');
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('Enter');
  for (const [key, count] of [
    ['ArrowRight', 80],
    ['ArrowDown', 20],
    ['ArrowLeft', 60],
    ['ArrowDown', 50],
    ['ArrowLeft', 20],
  ] as const) {
    for (let i = 0; i < count; i++) await page.keyboard.press(key);
    await page.keyboard.press('Space');
  }
  await expect(items).toHaveCount(6);
  await panel
    .getByRole('button', { name: 'بستن و اعمال کانتور قائم‌الزاویه', exact: true })
    .click();
  expect(await download()).toEqual(pointer);
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
});

test('orthogonal existing contour copies to a translated editable draft without altering the source until apply', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  const stl = 'دانلود STL کاتر قائم‌الزاویه',
    save = 'ذخیرهٔ فایل مستقل کاتر قائم‌الزاویه';
  const download = async (name: string) => {
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name, exact: true }).click();
    return readFile((await (await pending).path())!);
  };
  const doc = JSON.parse((await download(save)).toString());
  doc.points = [
    [-10.25, 20.125],
    [69.75, 20.125],
    [69.75, 50.375],
    [20.5, 50.375],
    [20.5, 100.125],
    [-10.25, 100.125],
  ];
  await panel.getByLabel('بازکردن فایل مستقل کاتر قائم‌الزاویه', { exact: true }).setInputFiles({
    name: 'translated.orthogonal.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  const original = await download(stl);
  const seed = panel.getByRole('button', {
      name: 'ویرایش نسخهٔ کانتور فعلی در محیط رسم',
      exact: true,
    }),
    cancel = panel.getByRole('button', { name: 'لغو رسم و حفظ کانتور قبلی', exact: true });
  const items = panel
    .getByRole('list', { name: 'نقاط پیش‌نویس قائم‌الزاویه به ترتیب', exact: true })
    .getByRole('listitem');
  await seed.click();
  await expect(items).toHaveCount(6);
  await expect(items.nth(0)).toHaveText('۰، ۰ mm');
  await expect(items.nth(2)).toHaveText('۸۰، ۳۰٫۲۵ mm');
  await expect(seed).toBeDisabled();
  await expect(panel.getByRole('button', { name: stl, exact: true })).toBeDisabled();
  await cancel.click();
  expect(await download(stl)).toEqual(original);
  await expect(
    panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true }),
  ).toBeDisabled();
  await seed.click();
  for (let i = 0; i < 2; i++)
    await panel.getByRole('button', { name: 'حذف آخرین نقطهٔ رسم', exact: true }).click();
  const add = async (x: number, y: number) => {
    await panel
      .getByRole('spinbutton', { name: 'مختصات افقی نقطهٔ رسم (mm)', exact: true })
      .fill(String(x));
    await panel
      .getByRole('spinbutton', { name: 'مختصات عمودی نقطهٔ رسم (mm)', exact: true })
      .fill(String(y));
    await panel.getByRole('button', { name: 'افزودن نقطهٔ قائم‌الزاویه', exact: true }).click();
  };
  const apply = panel.getByRole('button', {
    name: 'بستن و اعمال کانتور قائم‌الزاویه',
    exact: true,
  });
  await add(30.75, 100);
  await apply.click();
  await expect(panel.getByRole('alert')).toContainText('کانتور بسته پذیرفته نشد');
  await expect(panel.getByRole('button', { name: save, exact: true })).toBeDisabled();
  await add(0, 100);
  await apply.click();
  const changed = await download(stl);
  expect(changed).not.toEqual(original);
  expect(changed.readUInt32LE(80)).toBe(84);
  const file = await download(save);
  const points = JSON.parse(file.toString()).points as number[][];
  expect(Math.max(...points.map((p) => p[1]!)) - Math.min(...points.map((p) => p[1]!))).toBe(100);
  await panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true }).click();
  expect(await download(stl)).toEqual(original);
  await expect(
    panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true }),
  ).toBeDisabled();
  await panel.getByRole('button', { name: 'بازانجام ویرایش قائم‌الزاویه', exact: true }).click();
  expect(await download(stl)).toEqual(changed);
  await panel
    .getByLabel('بازکردن فایل مستقل کاتر قائم‌الزاویه', { exact: true })
    .setInputFiles({ name: 'edited.orthogonal.json', mimeType: 'application/json', buffer: file });
  await expect(seed).toBeEnabled();
  expect(await download(stl)).toEqual(changed);
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('live orthogonal trace snapshots become editable independent copies and expire on source changes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.getByText('ردیابی تصویر — Otsu و کانتور', { exact: true }).click();
  const trace = page.locator('.image-trace-tool');
  const pixel = trace.getByRole('checkbox', {
    name: 'ردیابی مرز پیکسلی قائم‌الزاویه',
    exact: true,
  });
  await pixel.check();
  const upload = async (hole = false) => {
    const image = await page.evaluate((hole) => {
      const c = document.createElement('canvas');
      c.width = 96;
      c.height = 96;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 96, 96);
      ctx.fillStyle = 'black';
      ctx.fillRect(16, 16, 64, 24);
      ctx.fillRect(16, 16, 24, 64);
      if (hole) {
        ctx.fillStyle = 'white';
        ctx.fillRect(22, 22, 10, 10);
      }
      return c.toDataURL('image/png').split(',')[1]!;
    }, hole);
    await trace.getByLabel('تصویر ردیابی', { exact: true }).setInputFiles({
      name: 'trace.png',
      mimeType: 'image/png',
      buffer: Buffer.from(image, 'base64'),
    });
  };
  await upload();
  const panel = trace.locator('.traced-orthogonal-cutter-tool');
  await panel.locator('summary').click();
  const live = panel.locator('.orthogonal-history-scope').first();
  const copy = panel.getByRole('region', {
    name: 'نسخهٔ مستقل قابل‌ویرایش کاتر تصویر',
    exact: true,
  });
  const copyButton = live.getByRole('button', {
    name: 'ساخت نسخهٔ مستقل قابل‌ویرایش از کاتر تصویر',
    exact: true,
  });
  const stl = 'دانلود STL کاتر قائم‌الزاویه';
  const download = async (target: typeof live, name: string) => {
    const pending = page.waitForEvent('download');
    await target.getByRole('button', { name, exact: true }).click();
    return readFile((await (await pending).path())!);
  };
  const height = live.getByRole('spinbutton', { name: 'ارتفاع کاتر قائم‌الزاویه', exact: true });
  await height.fill('24');
  await height.press('Enter');
  const original = await download(live, stl);
  await copyButton.click();
  await expect(copy).toBeVisible();
  await expect(
    copy.getByRole('spinbutton', { name: 'ارتفاع کاتر قائم‌الزاویه', exact: true }),
  ).toHaveValue('24');
  expect(await download(copy, stl)).toEqual(original);
  await copy.getByRole('button', { name: 'چرخش کاتر ۹۰ درجه به راست', exact: true }).click();
  const changed = await download(copy, stl);
  expect(changed).not.toEqual(original);
  expect(await download(live, stl)).toEqual(original);
  await copy.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true }).click();
  expect(await download(copy, stl)).toEqual(original);
  await height.fill('25');
  await height.press('Enter');
  await expect(
    copy.getByRole('spinbutton', { name: 'ارتفاع کاتر قائم‌الزاویه', exact: true }),
  ).toHaveValue('24');
  await copyButton.click();
  await expect(
    copy.getByRole('spinbutton', { name: 'ارتفاع کاتر قائم‌الزاویه', exact: true }),
  ).toHaveValue('25');
  await expect(
    copy.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true }),
  ).toBeDisabled();
  const width = trace.getByRole('spinbutton', { name: 'عرض مرجع تصویر', exact: true });
  await width.fill('80');
  await width.press('Enter');
  await expect(copy).toHaveCount(0);
  await copyButton.click();
  await expect(copy).toBeVisible();
  await pixel.uncheck();
  await expect(copy).toHaveCount(0);
  await expect(copyButton).toBeDisabled();
  await pixel.check();
  await copyButton.click();
  await copy.getByRole('button', { name: 'کنارگذاشتن نسخهٔ مستقل کاتر تصویر', exact: true }).click();
  await expect(copy).toHaveCount(0);
  await copyButton.click();
  await upload(true);
  await expect(copy).toHaveCount(0);
  await panel.locator('summary').click();
  await expect(copyButton).toBeDisabled();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('orthogonal draft history scopes shortcuts, restores cleared points and commits only once', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  await panel
    .getByRole('button', { name: 'بازیابی نمونهٔ U کاتر قائم‌الزاویه', exact: true })
    .click();
  const download = async () => {
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'دانلود STL کاتر قائم‌الزاویه', exact: true }).click();
    return readFile((await (await pending).path())!);
  };
  const original = await download();
  const mode = panel.getByRole('button', {
    name: 'حالت رسم عددی کانتور قائم‌الزاویه',
    exact: true,
  });
  await mode.click();
  const canvas = panel.getByRole('group', { name: 'پلان باز پیش‌نویس قائم‌الزاویه', exact: true }),
    items = panel
      .getByRole('list', { name: 'نقاط پیش‌نویس قائم‌الزاویه به ترتیب', exact: true })
      .getByRole('listitem'),
    undo = panel.getByRole('button', { name: 'برگرداندن تغییر نقاط پیش‌نویس', exact: true }),
    redo = panel.getByRole('button', { name: 'بازانجام تغییر نقاط پیش‌نویس', exact: true });
  await canvas.focus();
  await page.keyboard.press('Control+z');
  await expect(items).toHaveCount(0);
  await expect(mode).toHaveAttribute('aria-pressed', 'true');
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  const x = panel.getByRole('spinbutton', { name: 'مختصات افقی نقطهٔ رسم (mm)', exact: true }),
    y = panel.getByRole('spinbutton', { name: 'مختصات عمودی نقطهٔ رسم (mm)', exact: true });
  const add = async (px: number, py: number) => {
    await x.fill(String(px));
    await y.fill(String(py));
    await panel.getByRole('button', { name: 'افزودن نقطهٔ قائم‌الزاویه', exact: true }).click();
  };
  for (const [px, py] of [
    [0, 0],
    [80, 0],
    [80, 60],
    [0, 60],
  ])
    await add(px!, py!);
  await add(40, 20);
  await expect(panel.getByRole('alert')).toContainText('نقطه افزوده نشد');
  await undo.click();
  await expect(items).toHaveCount(3);
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await canvas.focus();
  await page.keyboard.press('Control+Shift+z');
  await expect(items).toHaveCount(4);
  await x.fill('33');
  await x.press('Control+z');
  await expect(items).toHaveCount(4);
  await panel.getByRole('button', { name: 'پاک‌کردن نقاط رسم', exact: true }).click();
  await expect(items).toHaveCount(0);
  await canvas.focus();
  await page.keyboard.press('Control+z');
  await expect(items).toHaveCount(4);
  await page.keyboard.press('Control+y');
  await expect(items).toHaveCount(0);
  await undo.click();
  await expect(items).toHaveCount(4);
  await undo.click();
  await expect(items).toHaveCount(3);
  await add(0, 80);
  await expect(items).toHaveCount(3);
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(items).toHaveCount(4);
  await undo.click();
  await panel.getByRole('button', { name: 'پاک‌کردن نقاط رسم', exact: true }).click();
  await expect(redo).toBeDisabled();
  await undo.click();
  await expect(items).toHaveCount(3);
  await add(0, 60);
  await expect(redo).toBeDisabled();
  await expect(
    panel.getByRole('button', { name: 'دانلود STL کاتر قائم‌الزاویه', exact: true }),
  ).toBeDisabled();
  await panel
    .getByRole('button', { name: 'بستن و اعمال کانتور قائم‌الزاویه', exact: true })
    .click();
  const drawn = await download();
  expect(drawn).not.toEqual(original);
  await panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true }).click();
  expect(await download()).toEqual(original);
  await mode.click();
  await expect(items).toHaveCount(0);
  await expect(undo).toBeDisabled();
  await panel.getByRole('button', { name: 'لغو رسم و حفظ کانتور قبلی', exact: true }).click();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('orthogonal rectangle booleans commit validated regions and never discard holes or disconnected pieces', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  const names = [
    'دانلود STL کاتر قائم‌الزاویه',
    'دانلود SVG مرز کاتر قائم‌الزاویه',
    'ذخیرهٔ فایل مستقل کاتر قائم‌الزاویه',
  ];
  const download = async (name: string) => {
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name, exact: true }).click();
    return readFile((await (await pending).path())!);
  };
  const doc = JSON.parse((await download(names[2]!)).toString());
  doc.points = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  await panel.getByLabel('بازکردن فایل مستقل کاتر قائم‌الزاویه', { exact: true }).setInputFiles({
    name: 'square.orthogonal.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  const original = await download(names[0]!);
  await panel.getByRole('button', { name: 'حالت عملیات بولی مستطیلی کاتر', exact: true }).click();
  const operation = panel.getByLabel('عملیات مستطیلی کاتر', { exact: true });
  const rect = async (x: number, y: number, w: number, h: number) => {
    for (const [name, value] of [
      ['مبدأ افقی مستطیل بولی (mm)', x],
      ['مبدأ عمودی مستطیل بولی (mm)', y],
      ['عرض مستطیل بولی (mm)', w],
      ['ارتفاع مستطیل بولی (mm)', h],
    ] as const)
      await panel.getByRole('spinbutton', { name, exact: true }).fill(String(value));
  };
  const apply = panel.getByRole('button', { name: 'اعمال عملیات بولی مستطیلی', exact: true }),
    cancel = panel.getByRole('button', { name: 'لغو پیش‌نویس بولی مستطیلی', exact: true }),
    undo = panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true });
  await rect(20, -20, 24, 40);
  for (const name of names)
    await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled();
  await apply.click();
  expect(JSON.parse((await download(names[2]!)).toString()).points).toHaveLength(8);
  const cut = await download(names[0]!);
  expect(cut).not.toEqual(original);
  await undo.click();
  expect(await download(names[0]!)).toEqual(original);
  await panel.getByRole('button', { name: 'بازانجام ویرایش قائم‌الزاویه', exact: true }).click();
  expect(await download(names[0]!)).toEqual(cut);
  await undo.click();
  await operation.selectOption('union');
  await rect(20, -20, 20, 40);
  await apply.click();
  expect(JSON.parse((await download(names[2]!)).toString()).points).toHaveLength(8);
  await undo.click();
  for (const [op, x, y, w, h] of [
    ['difference', 20, 20, 20, 20],
    ['difference', 40, -10, 20, 120],
    ['union', 120, 0, 20, 20],
    ['intersection', 120, 0, 20, 20],
  ] as const) {
    await operation.selectOption(op);
    await rect(x, y, w, h);
    await apply.click();
    await expect(panel.getByRole('alert')).toContainText('دقیقاً یک کانتور');
    for (const name of names)
      await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled();
    await cancel.click();
    await expect(panel.getByRole('button', { name: names[0]!, exact: true })).toBeEnabled();
  }
  await operation.selectOption('intersection');
  await rect(20, 0, 60, 100);
  await apply.click();
  const file = await download(names[2]!);
  expect(JSON.parse(file.toString()).points).toHaveLength(4);
  const clipped = await download(names[0]!);
  await panel
    .getByLabel('بازکردن فایل مستقل کاتر قائم‌الزاویه', { exact: true })
    .setInputFiles({ name: 'clipped.orthogonal.json', mimeType: 'application/json', buffer: file });
  expect(await download(names[0]!)).toEqual(clipped);
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('orthogonal boolean preview retains rejected rings and never commits or exports a draft', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  const output = panel.getByRole('button', { name: 'دانلود STL کاتر قائم‌الزاویه', exact: true });
  const download = async () => {
    const pending = page.waitForEvent('download');
    await output.click();
    return readFile((await (await pending).path())!);
  };
  const original = await download();
  await panel.getByRole('button', { name: 'حالت عملیات بولی مستطیلی کاتر', exact: true }).click();
  const preview = panel.getByRole('img', {
      name: 'پیش‌نمایش اعمال‌نشدهٔ عملیات بولی مستطیلی',
      exact: true,
    }),
    candidate = preview.locator('[data-layer="candidate"]'),
    status = panel.getByRole('status', { name: 'اعتبار پیش‌نمایش عملیات بولی', exact: true });
  await expect(preview.locator('[data-layer="operand"]')).toHaveAttribute('y', '-20');
  await expect(candidate).toHaveAttribute('data-valid', 'false');
  await panel.getByRole('spinbutton', { name: 'ارتفاع مستطیل بولی (mm)', exact: true }).fill('34');
  await expect(candidate).toHaveAttribute('data-valid', 'true');
  await expect(status).toContainText('هنوز اعمال نشده');
  await expect(output).toBeDisabled();
  await expect(
    panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true }),
  ).toBeDisabled();
  const wall = panel.getByRole('spinbutton', {
    name: 'ضخامت دیوارهٔ کاتر قائم‌الزاویه',
    exact: true,
  });
  await wall.fill('4');
  await wall.press('Enter');
  await expect(candidate).toHaveAttribute('data-valid', 'false');
  await wall.fill('1.6');
  await wall.press('Enter');
  await expect(candidate).toHaveAttribute('data-valid', 'true');
  for (const [name, value] of [
    ['مبدأ افقی مستطیل بولی (mm)', '5'],
    ['مبدأ عمودی مستطیل بولی (mm)', '40'],
    ['عرض مستطیل بولی (mm)', '10'],
    ['ارتفاع مستطیل بولی (mm)', '10'],
  ] as const)
    await panel.getByRole('spinbutton', { name, exact: true }).fill(value);
  await expect(candidate).toHaveAttribute('data-valid', 'false');
  await expect(candidate).toHaveAttribute('data-contours', '2');
  expect((await candidate.getAttribute('d'))!.match(/Z/g)).toHaveLength(2);
  await expect(candidate).toHaveAttribute('fill', 'none');
  await expect(status).toContainText('قابل اعمال نیست');
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await panel.getByRole('spinbutton', { name: 'عرض مستطیل بولی (mm)', exact: true }).fill('');
  await expect(preview.locator('[data-layer="operand"]')).toHaveCount(0);
  await expect(candidate).toHaveAttribute('data-contours', '0');
  expect(await preview.getAttribute('viewBox')).not.toMatch(/NaN|Infinity/);
  await panel.getByRole('button', { name: 'لغو پیش‌نویس بولی مستطیلی', exact: true }).click();
  expect(await download()).toEqual(original);
  await expect(
    panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('orthogonal polygon SVG booleans import exact operands, commit once and cancel late reads safely', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  const stl = 'دانلود STL کاتر قائم‌الزاویه',
    save = 'ذخیرهٔ فایل مستقل کاتر قائم‌الزاویه';
  const download = async (name: string) => {
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name, exact: true }).click();
    return readFile((await (await pending).path())!);
  };
  const doc = JSON.parse((await download(save)).toString());
  doc.points = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  await panel.getByLabel('بازکردن فایل مستقل کاتر قائم‌الزاویه', { exact: true }).setInputFiles({
    name: 'square.orthogonal.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  const original = await download(stl);
  await panel
    .getByRole('button', { name: 'حالت عملیات بولی با SVG قائم‌الزاویه', exact: true })
    .click();
  const input = panel.getByLabel('ورود SVG عملوند بولی قائم‌الزاویه', { exact: true });
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="40mm" viewBox="0 0 40 40"><polygon points="0,0 40,0 40,20 20,20 20,40 0,40"/></svg>';
  const upload = async (text: string, name = 'operand.svg') =>
    input.setInputFiles({ name, mimeType: 'image/svg+xml', buffer: Buffer.from(text) });
  await upload(svg);
  const operation = panel.getByLabel('عملیات بولی چندضلعی کاتر', { exact: true });
  await operation.selectOption('union');
  const x = panel.getByRole('spinbutton', { name: 'جابه‌جایی افقی عملوند SVG (mm)', exact: true }),
    y = panel.getByRole('spinbutton', { name: 'جابه‌جایی عمودی عملوند SVG (mm)', exact: true });
  await x.fill('80');
  await y.fill('20');
  const preview = panel.getByRole('img', { name: 'پیش‌نمایش بولی با چندضلعی SVG', exact: true }),
    candidate = preview.locator('[data-layer="candidate"]'),
    apply = panel.getByRole('button', { name: 'اعمال بولی با چندضلعی SVG', exact: true }),
    cancel = panel.getByRole('button', { name: 'لغو بولی SVG و حفظ کانتور قبلی', exact: true });
  await expect(candidate).toHaveAttribute('data-valid', 'true');
  await expect(panel.getByRole('button', { name: stl, exact: true })).toBeDisabled();
  await apply.click();
  const changed = await download(stl);
  expect(changed).not.toEqual(original);
  const file = await download(save);
  expect(JSON.parse(file.toString()).points.length).toBeGreaterThan(4);
  await panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true }).click();
  expect(await download(stl)).toEqual(original);
  await panel.getByRole('button', { name: 'بازانجام ویرایش قائم‌الزاویه', exact: true }).click();
  expect(await download(stl)).toEqual(changed);
  await upload(svg.replace('40,20', '39,20'));
  await expect(panel.getByRole('alert')).toContainText('SVG عملوند پذیرفته نشد');
  await expect(apply).toBeDisabled();
  await expect(preview.locator('[data-layer="operand"]')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: stl, exact: true })).toBeDisabled();
  await cancel.click();
  await expect(panel.getByRole('button', { name: stl, exact: true })).toBeEnabled();
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function () {
      if (this.name !== 'late.svg') return original.call(this);
      return new Promise<string>((resolve) => {
        (window as unknown as { releaseBooleanRead: () => Promise<void> }).releaseBooleanRead =
          async () => resolve(await original.call(this));
      });
    };
  });
  await upload(svg, 'late.svg');
  await expect(apply).toBeDisabled();
  await expect(panel.getByRole('button', { name: stl, exact: true })).toBeDisabled();
  await cancel.click();
  await page.evaluate(async () => {
    await (window as unknown as { releaseBooleanRead: () => Promise<void> }).releaseBooleanRead();
  });
  await expect(apply).toBeDisabled();
  await expect(preview.locator('[data-layer="operand"]')).toHaveCount(0);
  expect(await download(stl)).toEqual(changed);
  await upload(svg);
  await x.fill('');
  await expect(preview.locator('[data-layer="operand"]')).toHaveCount(0);
  await apply.click();
  await expect(panel.getByRole('alert')).toContainText('عملیات پذیرفته نشد');
  await cancel.click();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('optional Persian message chunks stay out of the initial editor and load with cutter tools', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/\/(cookieCutter|orthogonalCutter)-[^/]+\.js(?:\?|$)/.test(request.url()))
      requests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '📤 خروجی', exact: true })).toBeVisible();
  expect(requests).toEqual([]);
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  expect(requests).toEqual([]);
  await page.locator('.cookie-cutter-tool > summary').click();
  await expect(
    page.getByRole('button', { name: 'دانلود STL کاتر گرد', exact: true }),
  ).toBeEnabled();
  expect(requests.filter((url) => url.includes('/cookieCutter-'))).toHaveLength(1);
  expect(requests.filter((url) => url.includes('/orthogonalCutter-'))).toHaveLength(0);
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  await expect(
    panel.getByRole('button', { name: 'حالت عملیات بولی با SVG قائم‌الزاویه', exact: true }),
  ).toBeVisible();
  expect(requests.filter((url) => url.includes('/orthogonalCutter-'))).toHaveLength(1);
  await panel.locator('summary').click();
  await panel.locator('summary').click();
  expect(requests.filter((url) => url.includes('/orthogonalCutter-'))).toHaveLength(1);
  await expect(
    panel.getByRole('button', { name: 'دانلود STL کاتر قائم‌الزاویه', exact: true }),
  ).toBeEnabled();
});

test('orthogonal arbitrary draft point edits allow repair but never commit temporary diagonals or odd counts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  const stl = 'دانلود STL کاتر قائم‌الزاویه';
  const download = async (name = stl) => {
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name, exact: true }).click();
    return readFile((await (await pending).path())!);
  };
  const original = await download();
  await panel
    .getByRole('button', { name: 'ویرایش نسخهٔ کانتور فعلی در محیط رسم', exact: true })
    .click();
  const selection = panel.getByLabel('انتخاب نقطهٔ دلخواه پیش‌نویس', { exact: true }),
    status = panel.getByRole('status', { name: 'اعتبار بستن پیش‌نویس قائم‌الزاویه', exact: true });
  const coordinates = async (x: number, y: number) => {
    await panel
      .getByRole('spinbutton', { name: 'مختصات افقی نقطهٔ رسم (mm)', exact: true })
      .fill(String(x));
    await panel
      .getByRole('spinbutton', { name: 'مختصات عمودی نقطهٔ رسم (mm)', exact: true })
      .fill(String(y));
  };
  const replace = panel.getByRole('button', { name: 'جایگزینی مختصات نقطهٔ پیش‌نویس', exact: true }),
    insert = panel.getByRole('button', { name: 'درج نقطه پس از انتخاب پیش‌نویس', exact: true }),
    remove = panel.getByRole('button', { name: 'حذف نقطهٔ انتخاب‌شدهٔ پیش‌نویس', exact: true }),
    undo = panel.getByRole('button', { name: 'برگرداندن تغییر نقاط پیش‌نویس', exact: true }),
    apply = panel.getByRole('button', { name: 'بستن و اعمال کانتور قائم‌الزاویه', exact: true });
  await selection.selectOption('1');
  await coordinates(90, 0);
  await replace.click();
  await expect(status).toContainText('قابل بستن نیست');
  await apply.click();
  await expect(panel.getByRole('alert')).toContainText('کانتور بسته پذیرفته نشد');
  await expect(panel.getByRole('button', { name: stl, exact: true })).toBeDisabled();
  await selection.selectOption('2');
  await coordinates(90, 30);
  await replace.click();
  await expect(status).toContainText('قابل بستن است');
  await undo.click();
  await undo.click();
  await expect(status).toContainText('قابل بستن است');
  await selection.selectOption('1');
  await coordinates(90, 0);
  await insert.click();
  await expect(selection.locator('option')).toHaveCount(7);
  await expect(status).toContainText('قابل بستن نیست');
  await coordinates(90, 30);
  await insert.click();
  await expect(selection.locator('option')).toHaveCount(8);
  await selection.selectOption('1');
  await remove.click();
  await expect(selection.locator('option')).toHaveCount(7);
  await selection.selectOption('3');
  await remove.click();
  await expect(selection.locator('option')).toHaveCount(6);
  await expect(status).toContainText('قابل بستن است');
  await expect(panel.getByRole('button', { name: stl, exact: true })).toBeDisabled();
  await apply.click();
  const changed = await download();
  expect(changed).not.toEqual(original);
  expect(changed.readUInt32LE(80)).toBe(84);
  const file = JSON.parse((await download('ذخیرهٔ فایل مستقل کاتر قائم‌الزاویه')).toString());
  expect(file.points).toHaveLength(6);
  expect(
    Math.max(...file.points.map((p: number[]) => p[0]!)) -
      Math.min(...file.points.map((p: number[]) => p[0]!)),
  ).toBe(90);
  await panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true }).click();
  expect(await download()).toEqual(original);
  await expect(
    panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true }),
  ).toBeDisabled();
  await panel.getByRole('button', { name: 'بازانجام ویرایش قائم‌الزاویه', exact: true }).click();
  expect(await download()).toEqual(changed);
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('orthogonal cutter PDF is lazy, cancellable and prints one actual-size inner boundary', async ({
  page,
}) => {
  let release!: () => void, seen!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    requested = new Promise<void>((resolve) => {
      seen = resolve;
    });
  let first = true;
  await page.route('**/*vazirmatn*.js', async (route) => {
    if (first) {
      first = false;
      seen();
      await gate;
    }
    await route.continue();
  });
  const downloads: string[] = [];
  page.on('download', (file) => downloads.push(file.suggestedFilename()));
  const pdfRequests: string[] = [];
  page.on('request', (req) => {
    if (/jspdf|vazirmatn|orthogonal-cutter-pdf-/.test(req.url())) pdfRequests.push(req.url());
  });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  expect(pdfRequests).toEqual([]);
  const pdf = panel.getByRole('button', { name: 'دانلود PDF مرز کاتر قائم‌الزاویه', exact: true });
  await pdf.click();
  await requested;
  expect(pdfRequests.some((url) => url.includes('orthogonal-cutter-pdf-'))).toBe(true);
  await panel.getByRole('button', { name: 'لغو PDF کاتر قائم‌الزاویه', exact: true }).click();
  release();
  await expect(panel.getByRole('alert')).toContainText('ساخت PDF کاتر لغو شد');
  expect(downloads).toEqual([]);
  await expect(pdf).toBeEnabled();
  const pending = page.waitForEvent('download');
  await pdf.click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe('orthogonal-cutter_inner-boundary_A4-1to1.pdf');
  const source = await readFile((await file.path())!, 'latin1');
  expect(source.startsWith('%PDF-')).toBe(true);
  expect(source).toContain('/FontFile2');
  expect(source.match(/\/Type \/Page\b/g)).toHaveLength(1);
  expect(source).toContain('/MediaBox [0 0 595.28 841.89]');
  await expect(
    panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true }),
  ).toBeDisabled();
  await panel
    .getByRole('spinbutton', { name: 'مختصات افقی گوشهٔ قائم‌الزاویه (mm)', exact: true })
    .fill('10');
  await expect(pdf).toBeDisabled();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('orthogonal cutter PDF suppresses an old snapshot when settings change during imports', async ({
  page,
}) => {
  let release!: () => void, seen!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    requested = new Promise<void>((resolve) => {
      seen = resolve;
    });
  await page.route('**/*vazirmatn*.js', async (route) => {
    seen();
    await gate;
    await route.continue();
  });
  const downloads: string[] = [];
  page.on('download', (file) => downloads.push(file.suggestedFilename()));
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  const pdf = panel.getByRole('button', { name: 'دانلود PDF مرز کاتر قائم‌الزاویه', exact: true });
  await pdf.click();
  await requested;
  const height = panel.getByRole('spinbutton', { name: 'ارتفاع کاتر قائم‌الزاویه', exact: true });
  await height.fill('25');
  await height.press('Enter');
  await expect(pdf).toBeEnabled();
  release();
  const pending = page.waitForEvent('download');
  await pdf.click();
  const file = await pending;
  await expect(pdf).toBeEnabled();
  expect(downloads).toEqual([file.suggestedFilename()]);
  await panel
    .getByRole('button', { name: 'حالت رسم عددی کانتور قائم‌الزاویه', exact: true })
    .click();
  await expect(pdf).toBeDisabled();
  await panel.getByRole('button', { name: 'لغو رسم و حفظ کانتور قبلی', exact: true }).click();
  await expect(pdf).toBeEnabled();
});

test('orthogonal cutter DXF downloads an exact closed mm boundary and obeys geometry guards', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  const dxf = panel.getByRole('button', { name: 'دانلود DXF مرز کاتر قائم‌الزاویه', exact: true });
  const undo = panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true });
  await expect(undo).toBeDisabled();
  const pending = page.waitForEvent('download');
  await dxf.click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe('orthogonal-cutter_inner-boundary_W80-D80mm.dxf');
  const doc = new DxfParser().parseSync(await readFile((await file.path())!, 'utf8'))!;
  expect(doc.header['$INSUNITS']).toBe(4);
  expect(doc.entities).toHaveLength(1);
  const entity = doc.entities[0] as unknown as {
    shape: boolean;
    vertices: { x: number; y: number }[];
  };
  expect(entity.shape).toBe(true);
  expect(entity.vertices.map((p) => [p.x, p.y])).toEqual([
    [0, 0],
    [80, 0],
    [80, 30],
    [30, 30],
    [30, 80],
    [0, 80],
  ]);
  await expect(undo).toBeDisabled();
  await panel
    .getByRole('spinbutton', { name: 'مختصات افقی گوشهٔ قائم‌الزاویه (mm)', exact: true })
    .fill('24');
  await expect(dxf).toBeDisabled();
  await panel.getByRole('button', { name: 'لغو ویرایش گوشهٔ قائم‌الزاویه', exact: true }).click();
  await expect(dxf).toBeEnabled();
  const tip = panel
    .locator('.ctl')
    .filter({ hasText: 'ضخامت لبهٔ کاتر قائم‌الزاویه' })
    .locator('input.num');
  const wall = panel
    .locator('.ctl')
    .filter({ hasText: 'ضخامت دیوارهٔ کاتر قائم‌الزاویه' })
    .locator('input.num');
  await wall.fill('0.8');
  await wall.press('Tab');
  await tip.fill('1.2');
  await tip.press('Tab');
  await expect(dxf).toBeDisabled();
  await tip.fill('0.6');
  await tip.press('Tab');
  await expect(dxf).toBeEnabled();
  await panel
    .getByRole('button', { name: 'حالت رسم عددی کانتور قائم‌الزاویه', exact: true })
    .click();
  await expect(dxf).toBeDisabled();
  await panel.getByRole('button', { name: 'لغو رسم و حفظ کانتور قبلی', exact: true }).click();
  await expect(dxf).toBeEnabled();
  await panel.getByLabel('بازکردن فایل مستقل کاتر قائم‌الزاویه', { exact: true }).setInputFiles({
    name: 'bad.orthogonal.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{}'),
  });
  await expect(dxf).toBeDisabled();
  await expect(page.getByRole('button', { name: /^واگرد/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('orthogonal independent ZIP is lazy and cancellable, contains a consistent restorable tool snapshot', async ({
  page,
}) => {
  let release!: () => void, seen!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    requested = new Promise<void>((resolve) => {
      seen = resolve;
    });
  let first = true;
  await page.route('**/orthogonal-cutter-bundle-*.js', async (route) => {
    if (first) {
      first = false;
      seen();
      await gate;
    }
    await route.continue();
  });
  const requests: string[] = [],
    downloads: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('orthogonal-cutter-bundle-')) requests.push(req.url());
  });
  page.on('download', (file) => downloads.push(file.suggestedFilename()));
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  expect(requests).toEqual([]);
  const zip = panel.getByRole('button', {
    name: 'دانلود ZIP مستقل کاتر قائم‌الزاویه',
    exact: true,
  });
  const undo = panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true });
  await zip.click();
  await requested;
  await panel.getByRole('button', { name: 'لغو ZIP کاتر قائم‌الزاویه', exact: true }).click();
  release();
  await expect(panel.getByRole('alert')).toContainText('ساخت ZIP کاتر لغو شد');
  expect(downloads).toEqual([]);
  await expect(zip).toBeEnabled();
  const pending = page.waitForEvent('download');
  await zip.click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe('orthogonal-cutter_build_mm.zip');
  const entries = unzipSync(await readFile((await file.path())!));
  expect(Object.keys(entries).sort()).toEqual([
    'README.txt',
    'boundaries/inner.dxf',
    'boundaries/inner.svg',
    'cutter.orthogonal.json',
    'manifest.json',
    'parts/cutter.stl',
  ]);
  const saved = JSON.parse(strFromU8(entries['cutter.orthogonal.json']!));
  expect(saved.heightMm).toBe(20);
  expect(saved.wallMm).toBe(1.6);
  expect(strFromU8(entries['README.txt']!)).toContain('تماس غذایی');
  expect(
    new DxfParser().parseSync(strFromU8(entries['boundaries/inner.dxf']!))!.header['$INSUNITS'],
  ).toBe(4);
  expect(entries['parts/cutter.stl']!.length).toBe(84 + 84 * 50);
  await expect(undo).toBeDisabled();
  await panel.getByLabel('بازکردن فایل مستقل کاتر قائم‌الزاویه', { exact: true }).setInputFiles({
    name: 'restored.orthogonal.json',
    mimeType: 'application/json',
    buffer: Buffer.from(entries['cutter.orthogonal.json']!),
  });
  await expect(zip).toBeEnabled();
  await panel
    .getByRole('spinbutton', { name: 'مختصات افقی گوشهٔ قائم‌الزاویه (mm)', exact: true })
    .fill('24');
  await expect(zip).toBeDisabled();
  await panel.getByRole('button', { name: 'لغو ویرایش گوشهٔ قائم‌الزاویه', exact: true }).click();
  await expect(zip).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test('orthogonal ZIP suppresses an old snapshot after geometry changes during module loading', async ({
  page,
}) => {
  let release!: () => void, seen!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    requested = new Promise<void>((resolve) => {
      seen = resolve;
    });
  await page.route('**/orthogonal-cutter-bundle-*.js', async (route) => {
    seen();
    await gate;
    await route.continue();
  });
  const downloads: string[] = [];
  page.on('download', (file) => downloads.push(file.suggestedFilename()));
  await page.goto('/');
  await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
  await page.locator('.cookie-cutter-tool > summary').click();
  const panel = page.locator('.orthogonal-cutter-tool');
  await panel.locator('summary').click();
  const zip = panel.getByRole('button', {
    name: 'دانلود ZIP مستقل کاتر قائم‌الزاویه',
    exact: true,
  });
  await zip.click();
  await requested;
  const height = panel
    .locator('.ctl')
    .filter({ hasText: 'ارتفاع کاتر قائم‌الزاویه' })
    .locator('input.num');
  await height.fill('25');
  await height.press('Tab');
  await expect(zip).toBeEnabled();
  release();
  const pending = page.waitForEvent('download');
  await zip.click();
  const file = await pending;
  const entries = unzipSync(await readFile((await file.path())!));
  expect(JSON.parse(strFromU8(entries['cutter.orthogonal.json']!)).heightMm).toBe(25);
  expect(downloads).toEqual([file.suggestedFilename()]);
  await panel
    .getByRole('button', { name: 'حالت رسم عددی کانتور قائم‌الزاویه', exact: true })
    .click();
  await expect(zip).toBeDisabled();
});

for (const action of ['cancel', 'change geometry'] as const) {
  test(`orthogonal ZIP optional PDF is atomic and suppresses stale output on ${action}`, async ({
    page,
  }) => {
    let release!: () => void, seen!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
      }),
      requested = new Promise<void>((resolve) => {
        seen = resolve;
      });
    let first = true;
    await page.route('**/*vazirmatn*.js', async (route) => {
      if (first) {
        first = false;
        seen();
        await gate;
      }
      await route.continue();
    });
    const pdfRequests: string[] = [],
      downloads: string[] = [];
    page.on('request', (req) => {
      if (/jspdf|vazirmatn|orthogonal-cutter-pdf-/.test(req.url())) pdfRequests.push(req.url());
    });
    page.on('download', (file) => downloads.push(file.suggestedFilename()));
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: '📤 خروجی', exact: true }).click();
    await page.locator('.cookie-cutter-tool > summary').click();
    const panel = page.locator('.orthogonal-cutter-tool');
    await panel.locator('summary').click();
    const checkbox = panel.getByRole('checkbox', {
      name: 'افزودن PDF مقیاس واقعی به ZIP کاتر',
      exact: true,
    });
    const zip = panel.getByRole('button', {
      name: 'دانلود ZIP مستقل کاتر قائم‌الزاویه',
      exact: true,
    });
    await expect(checkbox).not.toBeChecked();
    if (action === 'cancel') {
      const pending = page.waitForEvent('download');
      await zip.click();
      const plain = await pending;
      const files = unzipSync(await readFile((await plain.path())!));
      expect(Object.keys(files)).toHaveLength(6);
      expect(strFromU8(files['README.txt']!)).toContain('PDF در این بسته انتخاب نشده');
      expect(pdfRequests).toEqual([]);
      downloads.length = 0;
    }
    await checkbox.check();
    expect(pdfRequests).toEqual([]);
    await zip.click();
    await requested;
    await expect(checkbox).toBeDisabled();
    if (action === 'cancel') {
      await panel.getByRole('button', { name: 'لغو ZIP کاتر قائم‌الزاویه', exact: true }).click();
      release();
      await expect(panel.getByRole('alert')).toContainText('ساخت ZIP کاتر لغو شد');
      expect(downloads).toEqual([]);
    } else {
      const height = panel
        .locator('.ctl')
        .filter({ hasText: 'ارتفاع کاتر قائم‌الزاویه' })
        .locator('input.num');
      await height.fill('25');
      await height.press('Tab');
      release();
    }
    await expect(zip).toBeEnabled();
    await expect(checkbox).toBeEnabled();
    const pending = page.waitForEvent('download');
    await zip.click();
    const file = await pending;
    const entries = unzipSync(await readFile((await file.path())!));
    expect(Object.keys(entries)).toHaveLength(7);
    const pdf = entries['boundaries/inner-A4-1to1.pdf']!;
    expect(pdf).toBeDefined();
    expect(strFromU8(pdf)).toContain('/MediaBox [0 0 595.28 841.89]');
    expect(strFromU8(pdf)).toContain('/FontFile2');
    const saved = JSON.parse(strFromU8(entries['cutter.orthogonal.json']!));
    expect(saved.heightMm).toBe(action === 'cancel' ? 20 : 25);
    expect(JSON.parse(strFromU8(entries['manifest.json']!)).files).toContainEqual({
      path: 'boundaries/inner-A4-1to1.pdf',
      bytes: pdf.byteLength,
    });
    expect(strFromU8(entries['README.txt']!)).toContain('خط‌کش کنترل ۱۰۰');
    expect(downloads).toEqual([file.suggestedFilename()]);
    await expect(
      panel.getByRole('button', { name: 'برگرداندن ویرایش قائم‌الزاویه', exact: true }),
    ).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      321,
    );
  });
}
