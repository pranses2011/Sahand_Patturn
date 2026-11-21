import { gunzipSync, strFromU8 } from 'fflate';
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

test('named pattern recipes reject duplicate names without overwriting and apply after reload',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  const name=page.getByRole('textbox',{name:'نام تنظیمات',exact:true});
  const tile=page.getByRole('spinbutton',{name:'اندازهٔ کاشی',exact:true});
  await name.fill('نمونهٔ من');await page.getByRole('button',{name:'ذخیرهٔ تنظیمات فعلی',exact:true}).click();
  await expect(name).toHaveValue('');
  const before=await page.evaluate(()=>localStorage.getItem('patturn:pattern-library:v1'));
  await tile.fill('60');await tile.press('Enter');
  await name.fill('  نمونهٔ من  ');await page.getByRole('button',{name:'ذخیرهٔ تنظیمات فعلی',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'این نام قبلاً ذخیره شده است'})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('patturn:pattern-library:v1'))).toBe(before);
  await expect(name).toHaveValue('  نمونهٔ من  ');
  await page.reload();await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  await tile.fill('60');await tile.press('Enter');
  await page.getByRole('button',{name:'اعمال نمونهٔ من',exact:true}).click();await expect(tile).toHaveValue('40');
  page.once('dialog',(dialog)=>dialog.dismiss());
  await page.getByRole('button',{name:'حذف نمونهٔ من',exact:true}).click();
  await expect(page.getByRole('button',{name:'اعمال نمونهٔ من',exact:true})).toBeVisible();
  page.once('dialog',(dialog)=>dialog.accept());
  await page.getByRole('button',{name:'حذف نمونهٔ من',exact:true}).click();
  await expect(page.getByRole('button',{name:'اعمال نمونهٔ من',exact:true})).toHaveCount(0);
});

test('control mode persists independently of project history',async({page})=>{
  await page.goto('/');
  const simple=page.getByRole('radio',{name:'ساده',exact:true});
  const pro=page.getByRole('radio',{name:'حرفه‌ای',exact:true});
  await expect(simple).toBeChecked();await pro.check();
  await page.reload();await expect(pro).toBeChecked();
  await expect(page.getByRole('spinbutton',{name:'تعداد سگمنت',exact:true})).toHaveValue('96');
  await simple.check();await page.reload();await expect(simple).toBeChecked();
  await expect(page.getByRole('spinbutton',{name:'ضخامت شعاعی برای ظرفیت',exact:true})).toHaveValue('4');
});

test('named recipe lists synchronize across browser tabs without changing either project',async({page,context})=>{
  const other=await context.newPage();
  for(const tab of [page,other]){
    await tab.goto('/');await tab.getByRole('button',{name:'🔷 الگو',exact:true}).click();
    await tab.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  }
  await page.getByRole('textbox',{name:'نام تنظیمات',exact:true}).fill('اشتراکی');
  await page.getByRole('button',{name:'ذخیرهٔ تنظیمات فعلی',exact:true}).click();
  await expect(other.getByRole('button',{name:'اعمال اشتراکی',exact:true})).toBeVisible();
  const tile=other.getByRole('spinbutton',{name:'اندازهٔ کاشی',exact:true});
  await tile.fill('60');await tile.press('Enter');
  other.once('dialog',(dialog)=>dialog.accept());
  await other.getByRole('button',{name:'حذف اشتراکی',exact:true}).click();
  await expect(page.getByRole('button',{name:'اعمال اشتراکی',exact:true})).toHaveCount(0);
  await expect(tile).toHaveValue('60');
  await expect(page.getByRole('spinbutton',{name:'اندازهٔ کاشی',exact:true})).toHaveValue('40');
  await other.close();
});

test('blocked localStorage does not prevent editing or portable export and recovery saves current state',async({page})=>{
  await page.addInitScript(()=>{
    const original=Object.getOwnPropertyDescriptor(window,'localStorage')!;
    (window as unknown as {testStorageBlocked:boolean}).testStorageBlocked=true;
    Object.defineProperty(window,'localStorage',{configurable:true,get(){
      if((window as unknown as {testStorageBlocked:boolean}).testStorageBlocked)throw new DOMException('Synthetic storage block','SecurityError');
      return original.get!.call(window);
    }});
  });
  const errors:string[]=[];page.on('pageerror',(error)=>errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('alert').filter({hasText:'بازیابی ذخیرهٔ محلی ناموفق بود'})).toBeVisible();
  const modeWarning=page.getByRole('status').filter({hasText:'ترجیح حالت رابط خوانده یا ذخیره نشد'});
  await expect(modeWarning).toBeVisible();
  await page.getByRole('radio',{name:'حرفه‌ای',exact:true}).check();
  const wall=page.getByRole('spinbutton',{name:'ضخامت شعاعی برای ظرفیت',exact:true});
  await wall.fill('6');await wall.press('Enter');
  const event=page.waitForEvent('download');await page.getByRole('button',{name:'ذخیرهٔ فایل پروژه',exact:true}).click();
  const path=await (await event).path();expect(path).not.toBeNull();
  expect(JSON.parse(strFromU8(gunzipSync(new Uint8Array(await readFile(path!))))).state.wall).toBe(6);
  await expect(page.getByRole('alert').filter({hasText:/^ذخیرهٔ محلی ناموفق بود/})).toBeVisible({timeout:10_000});
  await page.evaluate(()=>{(window as unknown as {testStorageBlocked:boolean}).testStorageBlocked=false;});
  await page.getByRole('alert').filter({hasText:/^ذخیرهٔ محلی ناموفق بود/}).getByRole('button',{name:'تلاش دوباره',exact:true}).click();
  await expect(page.locator('header')).toContainText('✓ ذخیره شد');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('patturn:editor-history:v1')!).entries[0].state.wall)).toBe(6);
  await page.getByRole('radio',{name:'ساده',exact:true}).check();await expect(modeWarning).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('renaming a saved recipe supports cancel and preserves its values across reload',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  await page.getByRole('textbox',{name:'نام تنظیمات',exact:true}).fill('قدیمی');
  await page.getByRole('button',{name:'ذخیرهٔ تنظیمات فعلی',exact:true}).click();
  page.once('dialog',(dialog)=>dialog.dismiss());
  await page.getByRole('button',{name:'تغییر نام قدیمی',exact:true}).click();
  await expect(page.getByRole('button',{name:'اعمال قدیمی',exact:true})).toBeVisible();
  page.once('dialog',(dialog)=>dialog.accept('جدید'));
  await page.getByRole('button',{name:'تغییر نام قدیمی',exact:true}).click();
  await expect(page.getByRole('button',{name:'اعمال قدیمی',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'اعمال جدید',exact:true})).toBeVisible();
  await page.reload();await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  const tile=page.getByRole('spinbutton',{name:'اندازهٔ کاشی',exact:true});await tile.fill('60');await tile.press('Enter');
  await page.getByRole('button',{name:'اعمال جدید',exact:true}).click();await expect(tile).toHaveValue('40');
});

test('updating a named recipe requires confirmation and preserves the saved name after reload',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  await page.getByRole('textbox',{name:'نام تنظیمات',exact:true}).fill('قابل ویرایش');
  await page.getByRole('button',{name:'ذخیرهٔ تنظیمات فعلی',exact:true}).click();
  const tile=page.getByRole('spinbutton',{name:'اندازهٔ کاشی',exact:true});
  await tile.fill('60');await tile.press('Enter');
  await page.getByRole('radio',{name:'موج',exact:true}).check();
  const update=page.getByRole('button',{name:'به‌روزرسانی قابل ویرایش با مقادیر فعلی',exact:true});
  const before=await page.evaluate(()=>localStorage.getItem('patturn:pattern-library:v1'));
  page.once('dialog',(dialog)=>dialog.dismiss());await update.click();
  expect(await page.evaluate(()=>localStorage.getItem('patturn:pattern-library:v1'))).toBe(before);
  page.once('dialog',(dialog)=>dialog.accept());await update.click();
  await page.reload();await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  await tile.fill('40');await tile.press('Enter');await page.getByRole('radio',{name:'لوزی',exact:true}).check();
  await page.getByRole('button',{name:'اعمال قابل ویرایش',exact:true}).click();
  await expect(tile).toHaveValue('60');await expect(page.getByRole('radio',{name:'موج',exact:true})).toBeChecked();
});

test('library backup downloads all named recipes without changing the active project',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  const name=page.getByRole('textbox',{name:'نام تنظیمات',exact:true});
  await name.fill('نقطه');await page.getByRole('button',{name:'ذخیرهٔ تنظیمات فعلی',exact:true}).click();
  const tile=page.getByRole('spinbutton',{name:'اندازهٔ کاشی',exact:true});await tile.fill('60');await tile.press('Enter');
  await page.getByRole('radio',{name:'موج',exact:true}).check();
  await name.fill('موج بزرگ');await page.getByRole('button',{name:'ذخیرهٔ تنظیمات فعلی',exact:true}).click();
  const event=page.waitForEvent('download');await page.getByRole('button',{name:'دانلود پشتیبان کتابخانهٔ الگو',exact:true}).click();
  const file=await event;expect(file.suggestedFilename()).toBe('patturn-pattern-library-v1.json');
  const path=await file.path();expect(path).not.toBeNull();
  expect(JSON.parse((await readFile(path!)).toString('utf8'))).toEqual({format:'patturn-pattern-library',version:1,entries:[
    {name:'نقطه',patternId:'dot-grid',tileSize:40},{name:'موج بزرگ',patternId:'wave',tileSize:60},
  ]});
  await expect(tile).toHaveValue('60');await expect(page.getByRole('radio',{name:'موج',exact:true})).toBeChecked();
});

test('library backup import requires confirmation, deduplicates and rejects conflicts without changing the project',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  const picker=page.getByLabel('انتخاب پشتیبان کتابخانهٔ الگو',{exact:true});
  const backup=(tileSize:number)=>({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'patturn-pattern-library',version:1,entries:[{name:'واردشده',patternId:'wave',tileSize}]}))});
  page.once('dialog',(dialog)=>dialog.dismiss());await picker.setInputFiles(backup(60));
  await expect(page.getByRole('button',{name:'ورود پشتیبان کتابخانهٔ الگو',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'اعمال واردشده',exact:true})).toHaveCount(0);
  page.once('dialog',(dialog)=>dialog.accept());await picker.setInputFiles(backup(60));
  await expect(page.getByRole('button',{name:'اعمال واردشده',exact:true})).toBeVisible();
  page.once('dialog',(dialog)=>dialog.accept());await picker.setInputFiles(backup(60));
  await expect(page.getByRole('button',{name:'ورود پشتیبان کتابخانهٔ الگو',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'اعمال واردشده',exact:true})).toHaveCount(1);
  const before=await page.evaluate(()=>localStorage.getItem('patturn:pattern-library:v1'));
  await picker.setInputFiles(backup(80));
  await expect(page.getByRole('alert').filter({hasText:'چیزی وارد نشد'})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('patturn:pattern-library:v1'))).toBe(before);
  await expect(page.getByRole('spinbutton',{name:'اندازهٔ کاشی',exact:true})).toHaveValue('40');
  await page.getByRole('button',{name:'اعمال واردشده',exact:true}).click();
  await expect(page.getByRole('spinbutton',{name:'اندازهٔ کاشی',exact:true})).toHaveValue('60');
});

test('leaving the pattern section discards a late backup read without prompting or writing',async({page})=>{
  await page.addInitScript(()=>{
    const original=File.prototype.arrayBuffer;
    File.prototype.arrayBuffer=async function(){
      if(this.name==='delayed.json'){
        await new Promise<void>((resolve)=>{
          (window as unknown as {testReleaseFileRead:()=>void}).testReleaseFileRead=resolve;
        });
      }
      const result=await original.call(this);
      (window as unknown as {testFileReadFinished:boolean}).testFileReadFinished=true;
      return result;
    };
  });
  let dialogs=0;page.on('dialog',async(dialog)=>{dialogs++;await dialog.dismiss();});
  await page.goto('/');await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  const backup={name:'delayed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'patturn-pattern-library',version:1,entries:[{name:'دیررس',patternId:'wave',tileSize:60}]}))};
  await page.getByLabel('انتخاب پشتیبان کتابخانهٔ الگو',{exact:true}).setInputFiles(backup);
  await expect(page.getByRole('button',{name:'در حال خواندن پشتیبان…',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'🏺 فرم',exact:true}).click();
  await page.evaluate(()=>{(window as unknown as {testReleaseFileRead:()=>void}).testReleaseFileRead();});
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {testFileReadFinished:boolean}).testFileReadFinished)).toBe(true);
  await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  await expect(page.getByRole('button',{name:'ورود پشتیبان کتابخانهٔ الگو',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'اعمال دیررس',exact:true})).toHaveCount(0);
  expect(dialogs).toBe(0);expect(await page.evaluate(()=>localStorage.getItem('patturn:pattern-library:v1'))).toBeNull();
});

test('backup read can be cancelled explicitly and a new import survives the old read completing',async({page})=>{
  await page.addInitScript(()=>{
    const original=File.prototype.arrayBuffer;
    File.prototype.arrayBuffer=async function(){
      if(this.name==='slow.json')await new Promise<void>((resolve)=>{
        (window as unknown as {testReleaseSlowRead:()=>void}).testReleaseSlowRead=resolve;
      });
      const result=await original.call(this);
      if(this.name==='slow.json')(window as unknown as {testSlowReadFinished:boolean}).testSlowReadFinished=true;
      return result;
    };
  });
  await page.goto('/');await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  const picker=page.getByLabel('انتخاب پشتیبان کتابخانهٔ الگو',{exact:true});
  const backup=(filename:string,name:string)=>({name:filename,mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'patturn-pattern-library',version:1,entries:[{name,patternId:'wave',tileSize:60}]}))});
  await picker.setInputFiles(backup('slow.json','قدیمی'));
  await page.getByRole('button',{name:'لغو خواندن پشتیبان',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'ورود پشتیبان لغو شد'})).toBeVisible();
  let dialogs=0;page.on('dialog',async(dialog)=>{dialogs++;await dialog.accept();});
  await picker.setInputFiles(backup('new.json','جدید'));
  await expect(page.getByRole('status').filter({hasText:'1 تنظیمات جدید افزوده شد'})).toBeVisible();
  await page.evaluate(()=>{(window as unknown as {testReleaseSlowRead:()=>void}).testReleaseSlowRead();});
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {testSlowReadFinished:boolean}).testSlowReadFinished)).toBe(true);
  await expect(page.getByRole('button',{name:'اعمال جدید',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'اعمال قدیمی',exact:true})).toHaveCount(0);expect(dialogs).toBe(1);
});

test('a grouped slider gesture returning to its initial value leaves no empty undo step',async({page})=>{
  await page.goto('/');
  const undo=page.getByRole('button',{name:/^واگرد/});await expect(undo).toBeDisabled();
  const slider=page.getByRole('slider',{name:'ضخامت شعاعی برای ظرفیت',exact:true});await slider.focus();
  await page.keyboard.down('ArrowUp');await expect(slider).toHaveValue('5');
  await page.keyboard.down('ArrowDown');await expect(slider).toHaveValue('4');
  await page.keyboard.up('ArrowDown');await page.keyboard.up('ArrowUp');
  await expect(undo).toBeDisabled();
  await page.keyboard.press('ArrowUp');await expect(slider).toHaveValue('5');
  await undo.click();await expect(slider).toHaveValue('4');await expect(undo).toBeDisabled();
});

test('a net-zero slider gesture after undo preserves the existing redo branch',async({page})=>{
  await page.goto('/');
  const wall=page.getByRole('spinbutton',{name:'ضخامت شعاعی برای ظرفیت',exact:true});
  await wall.fill('6');await wall.press('Enter');
  await page.getByRole('button',{name:/^واگرد/}).click();await expect(wall).toHaveValue('4');
  const slider=page.getByRole('slider',{name:'ضخامت شعاعی برای ظرفیت',exact:true});await slider.focus();
  await page.keyboard.down('ArrowUp');await page.keyboard.down('ArrowDown');
  await page.keyboard.up('ArrowDown');await page.keyboard.up('ArrowUp');
  await expect(wall).toHaveValue('4');
  const redo=page.getByRole('button',{name:/^ازنو/});await expect(redo).toBeEnabled();
  await redo.click();await expect(wall).toHaveValue('6');
});

test('project undo and redo shortcuts work on a focused slider but leave numeric drafts alone',async({page})=>{
  await page.goto('/');
  const slider=page.getByRole('slider',{name:'ضخامت شعاعی برای ظرفیت',exact:true});await slider.focus();
  await page.keyboard.press('ArrowUp');await expect(slider).toHaveValue('5');
  await page.keyboard.press('Control+z');await expect(slider).toHaveValue('4');
  await page.keyboard.press('Control+Shift+z');await expect(slider).toHaveValue('5');
  const wall=page.getByRole('spinbutton',{name:'ضخامت شعاعی برای ظرفیت',exact:true});
  await wall.fill('12');await wall.press('Control+z');
  // Native draft undo must not invoke project undo while the number field is focused.
  await expect(slider).toHaveValue('5');
  await wall.press('Escape');await expect(wall).toHaveValue('5');
});

test('physical history shortcuts handle Persian key values without intercepting composing events',async({page})=>{
  await page.goto('/');
  const slider=page.getByRole('slider',{name:'ضخامت شعاعی برای ظرفیت',exact:true});await slider.focus();
  await page.keyboard.press('ArrowUp');await expect(slider).toHaveValue('5');
  // Synthetic key values exercise the listener; this is not an OS keyboard-layout switch.
  await slider.evaluate((element)=>element.dispatchEvent(new KeyboardEvent('keydown',{key:'ظ',code:'KeyZ',ctrlKey:true,isComposing:true,bubbles:true,cancelable:true})));
  await expect(slider).toHaveValue('5');
  const undoAllowed=await slider.evaluate((element)=>element.dispatchEvent(new KeyboardEvent('keydown',{key:'ظ',code:'KeyZ',ctrlKey:true,bubbles:true,cancelable:true})));
  expect(undoAllowed).toBe(false);await expect(slider).toHaveValue('4');
  await slider.evaluate((element)=>element.dispatchEvent(new KeyboardEvent('keydown',{key:'ظ',code:'KeyZ',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true})));
  await expect(slider).toHaveValue('5');
});

test('cancelling a delayed project read preserves current edits and suppresses replacement prompts',async({page})=>{
  await page.addInitScript(()=>{
    const original=File.prototype.arrayBuffer;
    File.prototype.arrayBuffer=async function(){
      if(this.name==='delayed.patturn')await new Promise<void>((resolve)=>{
        (window as unknown as {testReleaseProjectRead:()=>void}).testReleaseProjectRead=resolve;
      });
      return original.call(this);
    };
  });
  await page.goto('/');
  const wall=page.getByRole('spinbutton',{name:'ضخامت شعاعی برای ظرفیت',exact:true});
  await wall.fill('6');await wall.press('Enter');
  const event=page.waitForEvent('download');await page.getByRole('button',{name:'ذخیرهٔ فایل پروژه',exact:true}).click();
  const path=await (await event).path();expect(path).not.toBeNull();const bytes=await readFile(path!);
  await wall.fill('8');await wall.press('Enter');
  let dialogs=0;page.on('dialog',async(dialog)=>{dialogs++;await dialog.dismiss();});
  await page.getByLabel('انتخاب فایل پروژه',{exact:true}).setInputFiles({name:'delayed.patturn',mimeType:'application/octet-stream',buffer:bytes});
  await page.getByRole('button',{name:'لغو بازکردن پروژه',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'بازکردن پروژه لغو شد'})).toBeVisible();
  await expect(page.getByRole('button',{name:'در حال خواندن…',exact:true})).toBeDisabled();
  await page.evaluate(()=>{(window as unknown as {testReleaseProjectRead:()=>void}).testReleaseProjectRead();});
  await expect(page.getByRole('button',{name:'بازکردن پروژه',exact:true})).toBeEnabled();
  await expect(wall).toHaveValue('8');expect(dialogs).toBe(0);
});

test('numeric draft ignores composing Enter and Escape before ordinary commit',async({page})=>{
  await page.goto('/');
  const number=page.getByRole('spinbutton',{name:'ضخامت شعاعی برای ظرفیت',exact:true});
  const slider=page.getByRole('slider',{name:'ضخامت شعاعی برای ظرفیت',exact:true});
  await number.fill('7');
  for(const key of ['Enter','Escape']){
    const allowed=await number.evaluate((element,key)=>element.dispatchEvent(new KeyboardEvent('keydown',{
      key,isComposing:true,bubbles:true,cancelable:true,
    })),key);
    expect(allowed).toBe(true);
    await expect(number).toBeFocused();await expect(number).toHaveValue('7');
    await expect(slider).toHaveValue('4');
  }
  await number.press('Enter');await expect(slider).toHaveValue('7');
  await page.getByRole('button',{name:/^واگرد/}).click();
  await expect(slider).toHaveValue('4');
});

test('a cancelled project read ignores late failure and permits a successful retry',async({page})=>{
  await page.addInitScript(()=>{
    const original=File.prototype.arrayBuffer;
    File.prototype.arrayBuffer=async function(){
      if(this.name==='late-error.patturn'){
        await new Promise<void>((_,reject)=>{
          (window as unknown as {testRejectProjectRead:()=>void}).testRejectProjectRead=()=>reject(new Error('LATE_READ_FAILURE'));
        });
      }
      return original.call(this);
    };
  });
  await page.goto('/');
  const wall=page.getByRole('spinbutton',{name:'ضخامت شعاعی برای ظرفیت',exact:true});
  await wall.fill('6');await wall.press('Enter');
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'ذخیرهٔ فایل پروژه',exact:true}).click();
  const path=await (await download).path();expect(path).not.toBeNull();const buffer=await readFile(path!);
  await wall.fill('8');await wall.press('Enter');
  const picker=page.getByLabel('انتخاب فایل پروژه',{exact:true});
  await picker.setInputFiles({name:'late-error.patturn',mimeType:'application/octet-stream',buffer});
  await page.getByRole('button',{name:'لغو بازکردن پروژه',exact:true}).click();
  await page.evaluate(()=>{(window as unknown as {testRejectProjectRead:()=>void}).testRejectProjectRead();});
  // Await the finally branch, not an arbitrary delay, before asserting that no stale error won.
  await expect(page.getByRole('button',{name:'بازکردن پروژه',exact:true})).toBeEnabled();
  await expect(page.getByRole('alert').filter({hasText:'بازکردن پروژه لغو شد'})).toBeVisible();
  await expect(page.getByRole('alert').filter({hasText:'فایل پروژه باز نشد'})).toHaveCount(0);
  await expect(wall).toHaveValue('8');
  const confirmation=page.waitForEvent('dialog');
  await picker.setInputFiles({name:'retry.patturn',mimeType:'application/octet-stream',buffer});
  const dialog=await confirmation;expect(dialog.type()).toBe('confirm');await dialog.accept();
  await expect(wall).toHaveValue('6');
  await expect(page.getByRole('alert').filter({hasText:'بازکردن پروژه لغو شد'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'بازکردن پروژه',exact:true})).toBeEnabled();
});

test('numeric corrections report clamping and invalid drafts without adding empty history steps',async({page})=>{
  await page.goto('/');
  const number=page.getByRole('spinbutton',{name:'ضخامت شعاعی برای ظرفیت',exact:true});
  const control=page.locator('.ctl').filter({has:number});
  await number.fill('100');await number.press('Enter');
  await expect(number).toHaveValue('20');
  await expect(control.getByRole('status')).toContainText('مقدار به ۲۰ mm');
  await number.fill('');await expect(control.getByRole('status')).toBeEmpty();
  await number.press('Enter');await expect(number).toHaveValue('20');
  await expect(control.getByRole('status')).toContainText('مقدار قبلی حفظ شد');
  await page.getByRole('button',{name:/^واگرد/}).click();
  await expect(number).toHaveValue('4');
  await expect(control.getByRole('status')).toBeEmpty();
  await expect(page.getByRole('button',{name:/^واگرد/})).toBeDisabled();
  await page.getByRole('button',{name:/^ازنو/}).click();
  await expect(number).toHaveValue('20');
  await expect(control.getByRole('status')).toBeEmpty();
});

test('profile undo and redo commands display Persian form names',async({page})=>{
  await page.goto('/');
  await page.getByRole('radio',{name:'سطل گشاد',exact:true}).check();
  const undo=page.getByRole('button',{name:'واگرد: فرم: گلدان مرجع ← سطل گشاد',exact:true});
  await expect(undo).toHaveAttribute('title','فرم: گلدان مرجع ← سطل گشاد');
  await undo.click();
  await expect(page.getByRole('radio',{name:'گلدان مرجع (۱۱۳۱ml)',exact:true})).toBeChecked();
  await page.getByRole('button',{name:'ازنو: فرم: گلدان مرجع ← سطل گشاد',exact:true}).click();
  await expect(page.getByRole('radio',{name:'سطل گشاد',exact:true})).toBeChecked();
});

test('pattern undo and redo use the same Persian names as the pattern library',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByRole('radio',{name:'شبکهٔ مربعی',exact:true}).check();
  await page.getByRole('button',{name:'واگرد: الگو: شبکهٔ نقطه‌ای ← شبکهٔ مربعی',exact:true}).click();
  await expect(page.getByRole('radio',{name:'شبکهٔ نقطه‌ای',exact:true})).toBeChecked();
  await page.getByRole('button',{name:'ازنو: الگو: شبکهٔ نقطه‌ای ← شبکهٔ مربعی',exact:true}).click();
  await expect(page.getByRole('radio',{name:'شبکهٔ مربعی',exact:true})).toBeChecked();
});

test('saved recipe summaries distinguish pattern types and applying a reloaded item restores its values',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  const save=async(name:string)=>{
    await page.getByLabel('نام تنظیمات',{exact:true}).fill(name);
    await page.getByRole('button',{name:'ذخیرهٔ تنظیمات فعلی',exact:true}).click();
  };
  await save('نمونه نقطه');
  await page.getByRole('radio',{name:'شبکهٔ مربعی',exact:true}).check();
  await save('نمونه مربع');
  await page.reload();await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  const dot=page.locator('.saved-patterns li').filter({has:page.getByRole('button',{name:'اعمال نمونه نقطه',exact:true})});
  const grid=page.locator('.saved-patterns li').filter({has:page.getByRole('button',{name:'اعمال نمونه مربع',exact:true})});
  await expect(dot).toContainText('نمونه نقطه — شبکهٔ نقطه‌ای — ۴۰ میلی‌متر');
  await expect(grid).toContainText('نمونه مربع — شبکهٔ مربعی — ۴۰ میلی‌متر');
  await dot.getByRole('button',{name:'اعمال نمونه نقطه',exact:true}).click();
  await expect(page.getByRole('radio',{name:'شبکهٔ نقطه‌ای',exact:true})).toBeChecked();
  await grid.getByRole('button',{name:'اعمال نمونه مربع',exact:true}).click();
  await expect(page.getByRole('radio',{name:'شبکهٔ مربعی',exact:true})).toBeChecked();
});

test('saved recipe search filters Persian names and pattern types without applying or deleting entries',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  await page.getByLabel('نام تنظیمات',{exact:true}).fill('کاشی اول');
  await page.getByRole('button',{name:'ذخیرهٔ تنظیمات فعلی',exact:true}).click();
  await page.getByRole('radio',{name:'شبکهٔ مربعی',exact:true}).check();
  await page.getByLabel('نام تنظیمات',{exact:true}).fill('نمونه دوم');
  await page.getByRole('button',{name:'ذخیرهٔ تنظیمات فعلی',exact:true}).click();
  const search=page.getByLabel('جست‌وجوی تنظیمات ذخیره‌شده',{exact:true});
  const list=page.locator('.saved-patterns li');
  await search.fill('كَاشي');await expect(list).toHaveCount(1);await expect(list).toContainText('کاشی اول');
  await expect(page.getByRole('radio',{name:'شبکهٔ مربعی',exact:true})).toBeChecked();
  await search.fill('مربعی');await expect(list).toHaveCount(1);await expect(list).toContainText('نمونه دوم');
  await search.fill('ناشناخته');await expect(list).toHaveCount(0);
  await expect(page.getByText('تنظیماتی پیدا نشد؛ نام تنظیمات یا نوع الگو را جست‌وجو کنید.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'پاک‌کردن جست‌وجوی تنظیمات',exact:true}).click();
  await expect(search).toBeFocused();
  await expect(list).toHaveCount(2);
  await page.reload();await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  await expect(list).toHaveCount(2);
});

test('clearing pattern search by keyboard restores input focus and permits immediate typing',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  const library=page.getByRole('group',{name:'الگوهای آماده',exact:true});
  const search=library.getByRole('searchbox',{name:'جست‌وجوی الگو',exact:true});
  await search.fill('ناشناخته');
  await expect(library.getByRole('radio')).toHaveCount(0);
  const clear=library.getByRole('button',{name:'پاک‌کردن جست‌وجو',exact:true});
  await clear.focus();await page.keyboard.press('Enter');
  await expect(search).toBeFocused();await expect(search).toHaveValue('');
  await expect(library.getByRole('radio')).toHaveCount(12);
  await expect(library.getByRole('radio',{name:'شبکهٔ نقطه‌ای',exact:true})).toBeChecked();
  await page.keyboard.type('grid');
  await expect(search).toHaveValue('grid');await expect(library.getByRole('radio')).toHaveCount(2);
});

test('library backup includes hidden recipes while a search filter is active',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  await page.getByLabel('نام تنظیمات',{exact:true}).fill('آشکار');
  await page.getByRole('button',{name:'ذخیرهٔ تنظیمات فعلی',exact:true}).click();
  await page.getByRole('radio',{name:'شبکهٔ مربعی',exact:true}).check();
  await page.getByLabel('نام تنظیمات',{exact:true}).fill('پنهان');
  await page.getByRole('button',{name:'ذخیرهٔ تنظیمات فعلی',exact:true}).click();
  const search=page.getByLabel('جست‌وجوی تنظیمات ذخیره‌شده',{exact:true});
  await search.fill('آشکار');
  const list=page.locator('.saved-patterns li');await expect(list).toHaveCount(1);
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'دانلود پشتیبان کتابخانهٔ الگو',exact:true}).click();
  const file=await download;expect(file.suggestedFilename()).toBe('patturn-pattern-library-v1.json');
  const path=await file.path();expect(path).not.toBeNull();
  expect(JSON.parse(await readFile(path!,'utf8'))).toEqual({
    format:'patturn-pattern-library',version:1,entries:[
      {name:'آشکار',patternId:'dot-grid',tileSize:40},
      {name:'پنهان',patternId:'grid',tileSize:40},
    ],
  });
  await expect(search).toHaveValue('آشکار');await expect(list).toHaveCount(1);
  await expect(page.getByRole('radio',{name:'شبکهٔ مربعی',exact:true})).toBeChecked();
  await page.getByRole('button',{name:'پاک‌کردن جست‌وجوی تنظیمات',exact:true}).click();
  await expect(list).toHaveCount(2);
});

test('hidden active pattern can be revealed without changing project selection or history',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  const library=page.getByRole('group',{name:'الگوهای آماده',exact:true});
  await library.getByRole('radio',{name:'شبکهٔ مربعی',exact:true}).check();
  const undo=page.getByRole('button',{name:/^واگرد/});const title=await undo.getAttribute('title');
  const search=library.getByRole('searchbox',{name:'جست‌وجوی الگو',exact:true});
  await search.fill('dot');
  await expect(library.getByRole('radio')).toHaveCount(1);
  await expect(library.getByText('الگوی فعال «شبکهٔ مربعی» در نتایج جست‌وجو پنهان است؛ انتخاب پروژه تغییر نکرده است.',{exact:true})).toBeVisible();
  const reveal=library.getByRole('button',{name:'نمایش الگوی فعال',exact:true});
  await reveal.focus();await page.keyboard.press('Enter');
  await expect(search).toHaveValue('');await expect(search).toBeFocused();
  await expect(library.getByRole('radio',{name:'شبکهٔ مربعی',exact:true})).toBeChecked();
  await expect(reveal).toHaveCount(0);await expect(undo).toHaveAttribute('title',title!);
  await undo.click();await expect(library.getByRole('radio',{name:'شبکهٔ نقطه‌ای',exact:true})).toBeChecked();
  await expect(undo).toBeDisabled();
});

test('recipe rename and deletion restore search focus only after successful confirmation',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  await page.getByLabel('نام تنظیمات',{exact:true}).fill('اول');
  await page.getByRole('button',{name:'ذخیرهٔ تنظیمات فعلی',exact:true}).click();
  const search=page.getByLabel('جست‌وجوی تنظیمات ذخیره‌شده',{exact:true});
  const rename=page.getByRole('button',{name:'تغییر نام اول',exact:true});
  await rename.focus();
  page.once('dialog',(dialog)=>dialog.dismiss());await page.keyboard.press('Enter');
  await expect(rename).toBeFocused();await expect(page.locator('.saved-patterns li')).toHaveCount(1);
  page.once('dialog',(dialog)=>dialog.accept('دوم'));await page.keyboard.press('Enter');
  await expect(search).toBeFocused();
  const remove=page.getByRole('button',{name:'حذف دوم',exact:true});await expect(remove).toBeVisible();
  await remove.focus();page.once('dialog',(dialog)=>dialog.dismiss());await page.keyboard.press('Enter');
  await expect(remove).toBeFocused();await expect(page.locator('.saved-patterns li')).toHaveCount(1);
  page.once('dialog',(dialog)=>dialog.accept());await page.keyboard.press('Enter');
  await expect(search).toBeFocused();await expect(page.locator('.saved-patterns li')).toHaveCount(0);
  await expect(page.getByRole('radio',{name:'شبکهٔ نقطه‌ای',exact:true})).toBeChecked();
});

test('saved recipe search matches Persian Arabic and Latin digits without renaming stored entries',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  for(const name of ['کاشی ۱۲','کاشی ۳۴']){
    await page.getByLabel('نام تنظیمات',{exact:true}).fill(name);
    await page.getByRole('button',{name:'ذخیرهٔ تنظیمات فعلی',exact:true}).click();
  }
  const search=page.getByLabel('جست‌وجوی تنظیمات ذخیره‌شده',{exact:true});
  const list=page.locator('.saved-patterns li');
  for(const query of ['12','١٢','۱۲']){
    await search.fill(query);await expect(list).toHaveCount(1);
    await expect(list.getByRole('button',{name:'اعمال کاشی ۱۲',exact:true})).toBeVisible();
  }
  await search.fill('34');await expect(list).toHaveCount(1);
  await expect(list.getByRole('button',{name:'اعمال کاشی ۳۴',exact:true})).toBeVisible();
  await page.reload();await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  await expect(list).toHaveCount(2);
  await expect(list.getByRole('button',{name:'اعمال کاشی ۱۲',exact:true})).toBeVisible();
  await expect(list.getByRole('button',{name:'اعمال کاشی ۳۴',exact:true})).toBeVisible();
});

test('failed browser delivery can be discarded and a fresh output downloaded without changing the project',async({page})=>{
  await page.addInitScript(()=>{
    const create=URL.createObjectURL.bind(URL);let fail=true;
    URL.createObjectURL=(blob)=>{
      if(fail){fail=false;throw new Error('SIMULATED_BROWSER_DELIVERY_FAILURE');}
      return create(blob);
    };
  });
  await page.goto('/');
  const wall=page.getByRole('spinbutton',{name:'ضخامت شعاعی برای ظرفیت',exact:true});
  await wall.fill('7');await wall.press('Enter');
  const undo=page.getByRole('button',{name:/^واگرد/});const title=await undo.getAttribute('title');
  await page.getByRole('button',{name:'خروجی SVG الگو',exact:true}).click();
  const failure=page.getByRole('alert').filter({hasText:'ممکن است فایل مقصد ناقص باشد'});
  await expect(failure).toBeVisible();
  await expect(failure.getByRole('button',{name:'تلاش دوبارهٔ همان خروجی',exact:true})).toBeVisible();
  await failure.getByRole('button',{name:'کنارگذاشتن خروجی ناموفق',exact:true}).click();
  await expect(failure).toHaveCount(0);
  await expect(page.getByRole('button',{name:'تلاش دوبارهٔ همان خروجی',exact:true})).toHaveCount(0);
  await expect(page.getByRole('status').filter({hasText:'خروجی ناموفق کنار گذاشته شد'})).toBeVisible();
  await expect(wall).toHaveValue('7');await expect(undo).toHaveAttribute('title',title!);
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'خروجی SVG الگو',exact:true}).click();
  const file=await downloaded;expect(file.suggestedFilename()).toMatch(/\.svg$/);
  const path=await file.path();expect(path).not.toBeNull();
  const svg=await readFile(path!,'utf8');expect(svg).toContain('<svg');expect(svg).toContain('<path');
  await expect(page.getByRole('status').filter({hasText:'درخواست دانلود به مرورگر ارسال شد'})).toBeVisible();
  await expect(wall).toHaveValue('7');await expect(undo).toHaveAttribute('title',title!);
});

test('a failed download click releases its Blob URL and retry delivers the retained snapshot',async({page})=>{
  await page.addInitScript(()=>{
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    const click=HTMLAnchorElement.prototype.click;
    const audit={created:[] as string[],revoked:[] as string[],blobs:[] as Blob[]};
    (window as unknown as {testDownloadAudit:typeof audit}).testDownloadAudit=audit;
    URL.createObjectURL=(blob)=>{
      const url=create(blob);audit.created.push(url);audit.blobs.push(blob as Blob);return url;
    };
    URL.revokeObjectURL=(url)=>{audit.revoked.push(url);revoke(url);};
    let fail=true;
    HTMLAnchorElement.prototype.click=function(){
      if(this.download && fail){fail=false;throw new Error('SIMULATED_DOWNLOAD_CLICK_FAILURE');}
      click.call(this);
    };
  });
  await page.goto('/');
  await page.getByRole('button',{name:'خروجی SVG الگو',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'ممکن است فایل مقصد ناقص باشد'})).toBeVisible();
  const first=await page.evaluate(()=>{
    const audit=(window as unknown as {testDownloadAudit:{created:string[];revoked:string[]}}).testDownloadAudit;
    return {created:audit.created,revoked:audit.revoked};
  });
  expect(first.created).toHaveLength(1);expect(first.revoked).toEqual(first.created);
  // Change the active pattern after failure; retry must still deliver the old snapshot.
  await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByRole('radio',{name:'شبکهٔ مربعی',exact:true}).check();
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'تلاش دوبارهٔ همان خروجی',exact:true}).click();
  const file=await downloaded;const path=await file.path();expect(path).not.toBeNull();
  const original=await page.evaluate(async()=>{
    const audit=(window as unknown as {testDownloadAudit:{blobs:Blob[]}}).testDownloadAudit;
    return {text:await audit.blobs[0]!.text(),type:audit.blobs[0]!.type};
  });
  expect(await readFile(path!,'utf8')).toBe(original.text);
  expect(original.type).toBe('image/svg+xml');
  await expect(page.getByRole('radio',{name:'شبکهٔ مربعی',exact:true})).toBeChecked();
  await expect(page.getByRole('button',{name:'تلاش دوبارهٔ همان خروجی',exact:true})).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>{
    const audit=(window as unknown as {testDownloadAudit:{created:string[];revoked:string[]}}).testDownloadAudit;
    return audit.revoked.length===2 && audit.created.length===2 && audit.revoked.every((url,index)=>url===audit.created[index]);
  })).toBe(true);
});

test('physical history fallback does not hijack Latin remapped or dead keys',async({page})=>{
  await page.goto('/');
  const slider=page.getByRole('slider',{name:'ضخامت شعاعی برای ظرفیت',exact:true});
  await slider.focus();await page.keyboard.press('ArrowUp');await expect(slider).toHaveValue('5');
  for(const key of ['a','w','Dead','Process','Unidentified']){
    const allowed=await slider.evaluate((element,key)=>element.dispatchEvent(new KeyboardEvent('keydown',{
      key,code:'KeyZ',ctrlKey:true,bubbles:true,cancelable:true,
    })),key);
    expect(allowed).toBe(true);await expect(slider).toHaveValue('5');
  }
  const allowed=await slider.evaluate((element)=>element.dispatchEvent(new KeyboardEvent('keydown',{
    key:'ظ',code:'KeyZ',ctrlKey:true,bubbles:true,cancelable:true,
  })));
  expect(allowed).toBe(false);await expect(slider).toHaveValue('4');
});

test('saved recipe matches follow current pattern and tile values including undo and redo',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  for(const name of ['نقطه اول','نقطه دوم']){
    await page.getByLabel('نام تنظیمات',{exact:true}).fill(name);
    await page.getByRole('button',{name:'ذخیرهٔ تنظیمات فعلی',exact:true}).click();
  }
  const matches=page.locator('.saved-patterns li').filter({hasText:'مطابق تنظیمات فعلی'});
  await expect(matches).toHaveCount(2);
  await page.getByRole('radio',{name:'شبکهٔ مربعی',exact:true}).check();
  await expect(matches).toHaveCount(0);
  await page.getByRole('button',{name:/^واگرد/}).click();await expect(matches).toHaveCount(2);
  await page.getByRole('button',{name:/^ازنو/}).click();await expect(matches).toHaveCount(0);
  await page.getByRole('button',{name:'اعمال نقطه اول',exact:true}).click();await expect(matches).toHaveCount(2);
  const tile=page.getByRole('spinbutton',{name:'اندازهٔ کاشی',exact:true});
  await tile.fill('41');await tile.press('Enter');await expect(matches).toHaveCount(0);
  await page.getByRole('button',{name:/^واگرد/}).click();await expect(matches).toHaveCount(2);
  await page.getByRole('button',{name:'اعمال نقطه دوم',exact:true}).click();
  await expect(page.locator('.saved-patterns li')).toHaveCount(2);await expect(matches).toHaveCount(2);
});

test('applying a saved recipe revalidates storage rather than trusting stale displayed values',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  await page.getByLabel('نام تنظیمات',{exact:true}).fill('قابل تغییر');
  await page.getByRole('button',{name:'ذخیرهٔ تنظیمات فعلی',exact:true}).click();
  const row=page.locator('.saved-patterns li');await expect(row).toContainText('شبکهٔ نقطه‌ای');
  // Same-document writes deliberately do not emit storage events. This leaves the
  // displayed row stale and tests click-time validation independently of refresh.
  await page.evaluate(()=>{
    const key='patturn:pattern-library:v1';
    const doc=JSON.parse(localStorage.getItem(key)!);
    doc.entries[0].patternId='grid';doc.entries[0].tileSize=61;
    localStorage.setItem(key,JSON.stringify(doc));
  });
  await expect(row).toContainText('شبکهٔ نقطه‌ای');
  const apply=page.getByRole('button',{name:'اعمال قابل تغییر',exact:true});await apply.click();
  await expect(page.getByRole('radio',{name:'شبکهٔ مربعی',exact:true})).toBeChecked();
  await expect(page.getByRole('spinbutton',{name:'اندازهٔ کاشی',exact:true})).toHaveValue('61');
  await expect(row).toContainText('شبکهٔ مربعی — ۶۱ میلی‌متر');
  const undo=page.getByRole('button',{name:/^واگرد/});const title=await undo.getAttribute('title');
  await page.evaluate(()=>localStorage.setItem('patturn:pattern-library:v1',JSON.stringify({version:1,entries:[]})));
  await apply.click();
  await expect(page.getByRole('alert').filter({hasText:'این تنظیمات دیگر در کتابخانه نیست'})).toBeVisible();
  await expect(page.getByRole('radio',{name:'شبکهٔ مربعی',exact:true})).toBeChecked();
  await expect(page.getByRole('spinbutton',{name:'اندازهٔ کاشی',exact:true})).toHaveValue('61');
  await expect(undo).toHaveAttribute('title',title!);
  await page.getByRole('button',{name:'بازخوانی / تلاش دوباره',exact:true}).click();
  await expect(row).toHaveCount(0);
});

test('empty saved library guidance is distinct from a search with no matches',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'🔷 الگو',exact:true}).click();
  await page.getByText('تنظیمات الگوی ذخیره‌شده',{exact:true}).click();
  const empty=page.getByText('هنوز تنظیماتی در این کتابخانه نیست؛ به تنظیمات فعلی نام بدهید و آن را ذخیره کنید، یا پشتیبان کتابخانه را وارد کنید.',{exact:true});
  const noMatch=page.getByText('تنظیماتی پیدا نشد؛ نام تنظیمات یا نوع الگو را جست‌وجو کنید.',{exact:true});
  await expect(empty).toBeVisible();await expect(noMatch).toHaveCount(0);
  await page.getByLabel('نام تنظیمات',{exact:true}).fill('نمونه');
  await page.getByRole('button',{name:'ذخیرهٔ تنظیمات فعلی',exact:true}).click();
  await expect(empty).toHaveCount(0);
  await page.getByLabel('جست‌وجوی تنظیمات ذخیره‌شده',{exact:true}).fill('ناشناخته');
  await expect(noMatch).toBeVisible();await expect(empty).toHaveCount(0);
  await page.getByRole('button',{name:'پاک‌کردن جست‌وجوی تنظیمات',exact:true}).click();
  await expect(noMatch).toHaveCount(0);
  page.once('dialog',(dialog)=>dialog.accept());
  await page.getByRole('button',{name:'حذف نمونه',exact:true}).click();
  await expect(empty).toBeVisible();await expect(noMatch).toHaveCount(0);
  await expect(page.getByRole('radio',{name:'شبکهٔ نقطه‌ای',exact:true})).toBeChecked();
  await page.evaluate(()=>localStorage.setItem('patturn:pattern-library:v1','{broken'));
  await page.getByRole('button',{name:'بازخوانی / تلاش دوباره',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'کتابخانه خوانده یا ذخیره نشد'})).toBeVisible();
  await expect(empty).toHaveCount(0);await expect(noMatch).toHaveCount(0);
});

test('privacy notice opens by keyboard using packaged text and preserves project history',async({page})=>{
  await page.goto('/');
  const wall=page.getByRole('spinbutton',{name:'ضخامت شعاعی برای ظرفیت',exact:true});
  await wall.fill('7');await wall.press('Enter');
  const undo=page.getByRole('button',{name:/^واگرد/});const title=await undo.getAttribute('title');
  const summary=page.getByText('حریم خصوصی و داده‌های محلی',{exact:true});
  await summary.focus();await page.keyboard.press('Enter');
  const notice=page.getByRole('region',{name:'اطلاعیهٔ حریم خصوصی',exact:true});
  await expect(notice).toBeVisible();await expect(notice).toContainText('localStorage');
  await expect(notice).toContainText('رمزگذاری اختصاصی برنامه محافظت نمی‌شوند');
  await expect(notice).toContainText('اجرای کاملاً آفلاین نسخهٔ نصب‌شده هنوز تأیید عملی نشده است');
  await expect(wall).toHaveValue('7');await expect(undo).toHaveAttribute('title',title!);
  await summary.focus();await page.keyboard.press('Enter');await expect(notice).not.toBeVisible();
});

test('optional support copies only the card number and reports clipboard denial without touching the project',async({page})=>{
  await page.addInitScript(()=>{
    const audit={text:'',deny:false};
    (window as unknown as {testSupportClipboard:typeof audit}).testSupportClipboard=audit;
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{
      if(audit.deny)throw Error('denied');audit.text=text;
    }}});
  });
  await page.goto('/');
  const wall=page.getByRole('spinbutton',{name:'ضخامت شعاعی برای ظرفیت',exact:true});
  await wall.fill('7');await wall.press('Enter');
  const undo=page.getByRole('button',{name:/^واگرد/});const title=await undo.getAttribute('title');
  const panel=page.getByRole('region',{name:'حمایت اختیاری و پشتیبانی',exact:true});
  const button=panel.getByRole('button',{name:'کپی شمارهٔ کارت حمایت',exact:true});
  await button.focus();await page.keyboard.press('Enter');
  await expect(panel.getByRole('status')).toContainText('شمارهٔ کارت کپی شد');
  const copied=await page.evaluate(()=>{
    const audit=(window as unknown as {testSupportClipboard:{text:string;deny:boolean}}).testSupportClipboard;
    audit.deny=true;return audit.text;
  });
  expect(copied).toMatch(/^\d{16}$/);
  await expect(panel.locator('p[dir="ltr"]').first()).toHaveText(copied.match(/.{4}/g)!.join(' '));
  await button.click();await expect(panel.getByRole('alert')).toContainText('دستی انتخاب و کپی کنید');
  await expect(wall).toHaveValue('7');await expect(undo).toHaveAttribute('title',title!);
});

test('optional local profile persists separately and can be deleted without changing the project',async({page})=>{
  await page.goto('/');
  const wall=page.getByRole('spinbutton',{name:'ضخامت شعاعی برای ظرفیت',exact:true});await wall.fill('7');await wall.press('Enter');
  const summary=page.getByText('پروفایل محلی و تنظیمات نمایش نام',{exact:true});await summary.click();
  await page.getByLabel('نام پروفایل محلی',{exact:true}).fill('کاربر آزمایشی');
  await page.getByLabel('ایمیل پروفایل محلی',{exact:true}).fill('local@example.com');
  await page.getByRole('checkbox',{name:'نمایش نام ذخیره‌شده در این بخش',exact:true}).check();
  await page.getByRole('button',{name:'ذخیرهٔ پروفایل محلی',exact:true}).click();
  await expect(page.getByText('پروفایل محلی: کاربر آزمایشی',{exact:true})).toBeVisible();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'ذخیرهٔ فایل پروژه',exact:true}).click();
  const path=await (await download).path();expect(path).not.toBeNull();
  const project=strFromU8(gunzipSync(new Uint8Array(await readFile(path!))));
  expect(project).not.toContain('local@example.com');expect(project).not.toContain('کاربر آزمایشی');
  await expect(page.locator('.saved')).toHaveText('✓ ذخیره شد');
  await page.reload();await summary.click();
  await expect(wall).toHaveValue('7');
  await expect(page.getByLabel('نام پروفایل محلی',{exact:true})).toHaveValue('کاربر آزمایشی');
  await expect(page.getByRole('checkbox',{name:'نمایش نام ذخیره‌شده در این بخش',exact:true})).toBeChecked();
  page.once('dialog',(dialog)=>dialog.dismiss());await page.getByRole('button',{name:'حذف پروفایل محلی',exact:true}).click();
  await expect(page.getByLabel('نام پروفایل محلی',{exact:true})).toHaveValue('کاربر آزمایشی');
  page.once('dialog',(dialog)=>dialog.accept());await page.getByRole('button',{name:'حذف پروفایل محلی',exact:true}).click();
  await expect(page.getByLabel('نام پروفایل محلی',{exact:true})).toHaveValue('');await expect(wall).toHaveValue('7');
});

test('corrupt local profile cannot be overwritten implicitly and explicit deletion recovers editing',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('patturn:local-profile:v1','{broken'));
  await page.goto('/');await page.getByText('پروفایل محلی و تنظیمات نمایش نام',{exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'پروفایل محلی خوانده نشد'})).toBeVisible();
  await expect(page.getByRole('button',{name:'ذخیرهٔ پروفایل محلی',exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>localStorage.getItem('patturn:local-profile:v1'))).toBe('{broken');
  page.once('dialog',(dialog)=>dialog.accept());await page.getByRole('button',{name:'حذف پروفایل محلی',exact:true}).click();
  await expect(page.getByRole('button',{name:'ذخیرهٔ پروفایل محلی',exact:true})).toBeEnabled();
  await page.getByLabel('نام پروفایل محلی',{exact:true}).fill('تازه');
  await page.getByRole('button',{name:'ذخیرهٔ پروفایل محلی',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'پروفایل فقط روی همین دستگاه ذخیره شد'})).toBeVisible();
});

test('chuck tool exports a validated tapered support independently of the project form',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'📤 خروجی',exact:true}).click();
  await page.getByText('چاک‌ساز — شیب ۲ درجه و سوراخ تخلیه',{exact:true}).click();
  const height=page.getByRole('spinbutton',{name:'ارتفاع چاک',exact:true});await height.fill('50');await height.press('Enter');
  await expect(page.getByRole('img',{name:'مقطع شماتیک چاک؛ سوراخ محوری در هر دو سر باز است',exact:true})).toBeVisible();
  await expect(page.getByRole('status').filter({hasText:'مش بسته و اعتبارسنجی‌شده؛ سوراخ تخلیه باز است'})).toBeVisible();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'دانلود STL چاک',exact:true}).click();
  const file=await download;expect(file.suggestedFilename()).toBe('chuck_taper2deg_D80-H50-drain8mm.stl');
  const path=await file.path();expect(path).not.toBeNull();const bytes=await readFile(path!);
  expect(bytes.readUInt32LE(80)).toBe(768);expect(bytes.length).toBe(84+768*50);
  const ys:number[]=[];
  for(let offset=84;offset<bytes.length;offset+=50){
    for(let v=0;v<3;v++){
      const start=offset+12+12*v;const x=bytes.readFloatLE(start),y=bytes.readFloatLE(start+4),z=bytes.readFloatLE(start+8);
      expect(Math.hypot(x,z)).toBeGreaterThan(3.999);ys.push(y);
    }
  }
  expect(Math.min(...ys)).toBe(0);expect(Math.max(...ys)).toBe(50);
  await page.getByRole('button',{name:'🏺 فرم',exact:true}).click();
  await expect(page.getByRole('button',{name:/^واگرد/})).toBeDisabled();
});

test('rounder tool exports a solid three-degree plug at the chosen nominal mouth diameter',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'📤 خروجی',exact:true}).click();
  await page.getByText('رینگ‌روندر — پلاگ مخروطی با شیب ۳ درجه',{exact:true}).click();
  const diameter=page.getByRole('spinbutton',{name:'قطر اسمی دهانهٔ رینگ‌روندر',exact:true});await diameter.fill('60');await diameter.press('Enter');
  await expect(page.getByRole('img',{name:'مقطع شماتیک رینگ‌روندر با خط قطر اسمی در نیمهٔ ارتفاع',exact:true})).toBeVisible();
  await expect(page.getByRole('status').filter({hasText:'مش رینگ‌روندر بسته و اعتبارسنجی‌شده است'})).toBeVisible();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'دانلود STL رینگ‌روندر',exact:true}).click();
  const file=await download;expect(file.suggestedFilename()).toBe('rounder_taper3deg_D60-H40mm.stl');
  const path=await file.path();expect(path).not.toBeNull();const bytes=await readFile(path!);
  expect(bytes.readUInt32LE(80)).toBe(384);expect(bytes.length).toBe(84+384*50);
  let base=0,tip=0;
  for(let offset=84;offset<bytes.length;offset+=50){
    for(let v=0;v<3;v++){
      const start=offset+12+12*v;const radius=Math.hypot(bytes.readFloatLE(start),bytes.readFloatLE(start+8));
      const y=bytes.readFloatLE(start+4);expect([0,40]).toContain(y);
      if(y===0)base=Math.max(base,radius);else tip=Math.max(tip,radius);
    }
  }
  expect(base+tip).toBeCloseTo(60,4);expect(Math.atan((base-tip)/40)*180/Math.PI).toBeCloseTo(3,4);
  await page.getByRole('button',{name:'🏺 فرم',exact:true}).click();
  await expect(page.getByRole('button',{name:/^واگرد/})).toBeDisabled();
});

test('horizontal split downloads capped parts and invalidates old results when cut height changes',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'📤 خروجی',exact:true}).click();
  await page.getByText('تقسیم افقی فرم در ارتفاع انتخابی',{exact:true}).click();
  await page.getByRole('button',{name:'ساخت دو قطعهٔ برش افقی',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'دو قطعه بسته و اعتبارسنجی شدند'})).toBeVisible({timeout:60_000});
  for(const [label,side] of [['پایین','lower'],['بالا','upper']] as const){
    const download=page.waitForEvent('download');
    await page.getByRole('button',{name:`دانلود STL قطعهٔ ${label}`,exact:true}).click();
    const file=await download;expect(file.suggestedFilename()).toBe(`form_horizontal-${side}_Y50mm.stl`);
    const path=await file.path();expect(path).not.toBeNull();const bytes=await readFile(path!);
    const tris=bytes.readUInt32LE(80);expect(tris).toBeGreaterThan(0);expect(bytes.length).toBe(84+tris*50);
    let min=Infinity,max=-Infinity;
    for(let offset=84;offset<bytes.length;offset+=50)for(let v=0;v<3;v++){
      const y=bytes.readFloatLE(offset+16+12*v);min=Math.min(min,y);max=Math.max(max,y);
    }
    if(side==='lower')expect(max).toBeCloseTo(50,4);else expect(min).toBeCloseTo(50,4);
  }
  const cut=page.getByRole('spinbutton',{name:'ارتفاع برش افقی',exact:true});await cut.fill('60');await cut.press('Enter');
  await expect(page.getByRole('button',{name:'دانلود STL قطعهٔ پایین',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'دانلود STL قطعهٔ بالا',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'ساخت دو قطعهٔ برش افقی',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'دو قطعه بسته و اعتبارسنجی شدند'})).toBeVisible({timeout:60_000});
  await expect(page.getByRole('button',{name:/^واگرد/})).toBeDisabled();
});

test('horizontal split reports WASM failure independently and an explicit retry recovers',async({page})=>{
  let allow=false;
  await page.route('**/*.wasm',async(route)=>{if(allow)await route.continue();else await route.abort('failed');});
  await page.goto('/');await page.getByRole('button',{name:'📤 خروجی',exact:true}).click();
  await page.getByText('تقسیم افقی فرم در ارتفاع انتخابی',{exact:true}).click();
  await page.getByRole('button',{name:'ساخت دو قطعهٔ برش افقی',exact:true}).click();
  const error=page.getByRole('alert').filter({hasText:'تقسیم افقی ناموفق بود؛ فرم اصلی تغییر نکرد'});
  await expect(error).toBeVisible();
  await expect(page.getByRole('button',{name:'دانلود STL قطعهٔ پایین',exact:true})).toHaveCount(0);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'⬇ خروجی STL فرم',exact:true}).click();await download;
  allow=true;await page.getByRole('button',{name:'ساخت دو قطعهٔ برش افقی',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'دو قطعه بسته و اعتبارسنجی شدند'})).toBeVisible({timeout:60_000});
  await expect(error).toHaveCount(0);
});

test('jigsaw tool exports deterministic shared-cut SVG and DXF with editable seed',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'📤 خروجی',exact:true}).click();
  await page.getByText('الگوی پازل — اتصال jigsaw با seed قطعی',{exact:true}).click();
  const preview=page.getByRole('img',{name:'پیش‌نمایش خطوط برش الگوی پازل',exact:true});
  await expect(preview.locator('path')).toHaveCount(13);
  const first=await preview.innerHTML();
  const seed=page.getByRole('spinbutton',{name:'seed پازل',exact:true});await seed.fill('43');await seed.press('Enter');
  expect(await preview.innerHTML()).not.toBe(first);
  await seed.fill('42');await seed.press('Enter');expect(await preview.innerHTML()).toBe(first);
  for(const format of ['SVG','DXF']){
    const download=page.waitForEvent('download');await page.getByRole('button',{name:`دانلود ${format} پازل`,exact:true}).click();
    const file=await download;expect(file.suggestedFilename()).toBe(`jigsaw_3x3_cell40-tab3-seed42mm.${format.toLowerCase()}`);
    const path=await file.path();expect(path).not.toBeNull();const text=await readFile(path!,'utf8');
    if(format==='SVG'){expect(text).toContain('width="120mm"');expect(text.match(/<path /g)).toHaveLength(13);}
    else {expect(text).toContain('AC1009');expect(text).toContain('LINE');}
  }
  await expect(page.getByRole('button',{name:/^واگرد/})).toBeDisabled();
});
