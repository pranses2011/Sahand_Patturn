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

test('section navigation works with Tab, Enter and Space and reports the current section',async({page})=>{
  await page.goto('/');
  const nav=page.getByRole('navigation',{name:'بخش‌های طراحی',exact:true});
  const form=nav.getByRole('button',{name:'🏺 فرم',exact:true});
  await expect(form).toHaveAttribute('aria-current','page');
  await form.focus();await page.keyboard.press('Tab');
  const pattern=nav.getByRole('button',{name:'🔷 الگو',exact:true});
  await expect(pattern).toBeFocused();await page.keyboard.press('Enter');
  await expect(pattern).toHaveAttribute('aria-current','page');
  await expect(page.getByRole('img',{name:'پیش‌نمایش تخت الگو روی بوم ۳۰۰ در ۳۰۰ میلی‌متر'})).toBeVisible();
  await page.keyboard.press('Tab');
  const mold=nav.getByRole('button',{name:'🧱 قالب',exact:true});
  await expect(mold).toBeFocused();await page.keyboard.press('Space');
  await expect(mold).toHaveAttribute('aria-current','page');
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
});

test('autosave quota failure preserves previous history and retry persists across reload',async({page})=>{
  await page.addInitScript(()=>{
    const key='patturn:editor-history:v1';
    if(localStorage.getItem(key)===null)localStorage.setItem(key,JSON.stringify({version:1,entries:[{
      id:'initial',savedAt:'2026-11-20T00:00:00.000Z',state:{profileMode:'reference',segments:96,wall:4,shrink:12,fill:80,patternId:'dot-grid',tileSize:40},
    }]}));
    (window as unknown as {testDenyHistoryWrites:boolean}).testDenyHistoryWrites=true;
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(name,value){
      if(name===key&&(window as unknown as {testDenyHistoryWrites:boolean}).testDenyHistoryWrites)
        throw new DOMException('Synthetic quota limit','QuotaExceededError');
      return original.call(this,name,value);
    };
  });
  await page.goto('/');
  const previous=await page.evaluate(()=>localStorage.getItem('patturn:editor-history:v1'));
  const wall=page.getByRole('spinbutton',{name:'ضخامت شعاعی برای ظرفیت',exact:true});
  await wall.fill('6');await wall.press('Enter');
  const error=page.getByRole('alert').filter({hasText:/^ذخیرهٔ محلی ناموفق بود/});
  await expect(error).toBeVisible({timeout:10_000});
  expect(await page.evaluate(()=>localStorage.getItem('patturn:editor-history:v1'))).toBe(previous);
  await expect(page.locator('header')).not.toContainText('✓ ذخیره شد');
  await page.evaluate(()=>{(window as unknown as {testDenyHistoryWrites:boolean}).testDenyHistoryWrites=false;});
  await error.getByRole('button',{name:'تلاش دوباره',exact:true}).click();
  await expect(error).toHaveCount(0);
  await expect(page.locator('header')).toContainText('✓ ذخیره شد');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('patturn:editor-history:v1')!));
  expect(saved.entries[0].state.wall).toBe(6);expect(saved.entries[1].state.wall).toBe(4);
  await page.reload();await expect(wall).toHaveValue('6');
});

test('corrupted autosave is not silently overwritten and portable export remains available',async({page})=>{
  await page.addInitScript(()=>{localStorage.setItem('patturn:editor-history:v1','{broken');});
  await page.goto('/');
  await expect(page.getByRole('alert').filter({hasText:'بازیابی ذخیرهٔ محلی ناموفق بود'})).toBeVisible();
  const wall=page.getByRole('spinbutton',{name:'ضخامت شعاعی برای ظرفیت',exact:true});
  await wall.fill('7');await wall.press('Enter');
  const error=page.getByRole('alert').filter({hasText:/^ذخیرهٔ محلی ناموفق بود/});
  await expect(error).toBeVisible({timeout:10_000});
  await error.getByRole('button',{name:'تلاش دوباره',exact:true}).click();
  expect(await page.evaluate(()=>localStorage.getItem('patturn:editor-history:v1'))).toBe('{broken');
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'ذخیرهٔ فایل پروژه',exact:true}).click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.patturn$/);
  await expect(wall).toHaveValue('7');
});


test('keyboard focus is visible and numeric units are available as accessible descriptions',async({page})=>{
  await page.goto('/');
  const form=page.getByRole('navigation',{name:'بخش‌های طراحی'}).getByRole('button',{name:'🏺 فرم',exact:true});
  await form.focus();await page.keyboard.press('Tab');
  const pattern=page.getByRole('navigation',{name:'بخش‌های طراحی'}).getByRole('button',{name:'🔷 الگو',exact:true});
  await expect(pattern).toBeFocused();
  await expect(pattern).toHaveCSS('outline-style','solid');await expect(pattern).toHaveCSS('outline-width','3px');
  const wall=page.getByRole('spinbutton',{name:'ضخامت شعاعی برای ظرفیت',exact:true});
  await wall.focus();await expect(wall).toHaveCSS('outline-width','3px');
  await expect(wall).toHaveAccessibleDescription('mm');
  const slider=page.getByRole('slider',{name:'ضخامت شعاعی برای ظرفیت',exact:true});
  await page.keyboard.press('Tab');await expect(slider).toBeFocused();
  await expect(slider).toHaveCSS('outline-width','3px');await expect(slider).toHaveAccessibleDescription('mm');
  await expect(page.getByRole('spinbutton',{name:'شیرینک',exact:true})).toHaveAccessibleDescription('%');
});

test('invalid or oversized project imports preserve edits; cancelling replacement permits a later valid import',async({page})=>{
  await page.goto('/');
  const wall=page.getByRole('spinbutton',{name:'ضخامت شعاعی برای ظرفیت',exact:true});
  await wall.fill('6');await wall.press('Enter');
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'ذخیرهٔ فایل پروژه',exact:true}).click();
  const validPath=await (await downloaded).path();expect(validPath).not.toBeNull();
  await wall.fill('8');await wall.press('Enter');
  const input=page.getByLabel('انتخاب فایل پروژه',{exact:true});
  let dialogs=0;
  const dismiss=(dialog:import('@playwright/test').Dialog)=>{dialogs++;void dialog.dismiss();};
  page.on('dialog',dismiss);
  const error=page.getByRole('alert').filter({hasText:'فایل پروژه باز نشد؛ تنظیمات فعلی تغییر نکرد'});
  await input.setInputFiles({name:'broken.patturn',mimeType:'application/octet-stream',buffer:Buffer.from('not gzip')});
  await expect(error).toBeVisible();await expect(wall).toHaveValue('8');expect(dialogs).toBe(0);
  await input.setInputFiles({name:'oversized.patturn',mimeType:'application/octet-stream',buffer:Buffer.alloc(256*1024+1)});
  await expect(error).toContainText('PROJECT_FILE_TOO_LARGE');await expect(wall).toHaveValue('8');expect(dialogs).toBe(0);
  await input.setInputFiles(validPath!);
  await expect.poll(()=>dialogs).toBe(1);await expect(wall).toHaveValue('8');await expect(error).toHaveCount(0);
  await expect(page.getByRole('button',{name:'بازکردن پروژه',exact:true})).toBeEnabled();
  page.off('dialog',dismiss);page.once('dialog',(dialog)=>dialog.accept());
  await input.setInputFiles(validPath!);await expect(wall).toHaveValue('6');
  await expect(error).toHaveCount(0);
});

test('pattern search filters locally without changing the selected project pattern',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  const library=page.getByRole('group',{name:'الگوهای آماده',exact:true});
  const search=library.getByRole('searchbox',{name:'جست‌وجوی الگو'});
  await expect(library.getByRole('radio')).toHaveCount(12);
  await search.fill('كوميكو');await expect(library.getByRole('radio')).toHaveCount(1);
  await library.getByRole('radio').check();
  await search.fill('not-found');await expect(library.getByRole('radio')).toHaveCount(0);
  await expect(library.getByRole('status')).toContainText('0 الگو از 12');
  await library.getByRole('button',{name:'پاک‌کردن جست‌وجو',exact:true}).click();
  await expect(library.getByRole('radio')).toHaveCount(12);
  await expect(library.getByRole('radio',{name:'الهام از کومیکو',exact:true})).toBeChecked();
  await expect(page.getByRole('spinbutton',{name:'اندازهٔ کاشی',exact:true})).toHaveValue('40');
});
