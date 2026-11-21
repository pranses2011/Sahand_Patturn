import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('WebGL failure stays isolated; parameter edit, undo/redo and portable project round-trip work', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('alert').filter({ hasText: 'نمایش سه‌بعدی در دسترس نیست' })).toBeVisible();
  const wall = page.locator('.ctl').filter({ hasText: 'ضخامت شعاعی برای ظرفیت' }).locator('input.num');
  await expect(wall).toHaveValue('4');
  await wall.fill('6'); await wall.press('Tab');
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
  await wall.fill('8'); await wall.press('Tab');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('انتخاب فایل پروژه', { exact: true }).setInputFiles(path!);
  await expect(wall).toHaveValue('6');
  await expect(page.getByRole('button', { name: 'خروجی SVG الگو', exact: true })).toBeEnabled();
});

test('flat pattern selection and SVG/DXF downloads work without WebGL', async ({ page }) => {
  await page.goto('/');
  await page.getByText('🔷 الگو', { exact: true }).click();
  await page.getByRole('radio', { name: 'موج', exact: true }).check();
  await expect(page.getByRole('img', { name: 'پیش‌نمایش تخت الگو روی بوم ۳۰۰ در ۳۰۰ میلی‌متر' })).toBeVisible();
  await expect(page.locator('.viewport canvas')).toHaveCount(0);
  const svgEvent=page.waitForEvent('download');
  await page.getByRole('button', { name:'خروجی SVG الگو',exact:true }).click();
  const svg=await svgEvent;
  expect(await readFile((await svg.path())!,'utf8')).toContain('stroke-width="1.5"');
  await page.getByText('📤 خروجی', { exact:true }).click();
  const dxfEvent=page.waitForEvent('download');
  await page.getByRole('button', {name:/DXF الگو/}).click();
  const dxf=await dxfEvent;
  const text=await readFile((await dxf.path())!,'utf8');
  expect(text).toContain('tolerance 0.05 mm');expect(text).toContain('\nLINE\n');
  await expect(page.getByRole('status').filter({hasText:'درخواست دانلود به مرورگر ارسال شد'})).toBeVisible();
});

test('numeric draft supports clearing, decimal typing, escape and committed undo',async({page})=>{
  await page.goto('/');
  const wall=page.getByRole('spinbutton',{name:'ضخامت شعاعی برای ظرفیت',exact:true});
  await wall.fill('');await expect(wall).toHaveValue('');
  await expect(page.locator('footer')).toContainText('Wall 4');
  await wall.press('Tab');await expect(wall).toHaveValue('4');
  await wall.fill('12');await wall.press('Escape');await expect(wall).toHaveValue('4');
  const shrink=page.getByRole('spinbutton',{name:'شیرینک',exact:true});
  await shrink.fill('');await shrink.pressSequentially('12.5');
  await expect(page.locator('footer')).toContainText('Shrink 12%');
  await shrink.press('Enter');await expect(page.locator('footer')).toContainText('Shrink 12.5%');
  await page.getByRole('button',{name:/^واگرد/}).click();await expect(shrink).toHaveValue('12');
});
