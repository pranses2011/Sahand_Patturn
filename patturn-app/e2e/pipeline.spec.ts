import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, gunzipSync, strFromU8 } from 'fflate';
import DxfParser from 'dxf-parser';

test('form to mold to ZIP uses local assets only and exports coherent manufacturing files',async({page,baseURL})=>{
  test.setTimeout(120_000);
  const external:string[]=[];
  await page.route('**/*',async(route)=>{
    const url=route.request().url();
    if(url.startsWith('http:')||url.startsWith('https:')){
      if(new URL(url).origin!==new URL(baseURL!).origin){external.push(url);await route.abort();return;}
    }
    await route.continue();
  });
  await page.goto('/');
  await page.getByRole('radio',{name:'حرفه‌ای',exact:true}).check();
  const segments=page.locator('.ctl').filter({hasText:'تعداد سگمنت'}).locator('input.num');
  await segments.fill('24');await segments.press('Tab');
  await page.getByText('🔷 الگو',{exact:true}).click();
  await page.getByRole('radio',{name:'موج',exact:true}).check();
  await page.getByText('🧱 قالب',{exact:true}).click();
  await expect(page.getByText('✅ قالب سه‌بعدی ساخته شد — در viewport ببینید',{exact:false})).toBeVisible({timeout:90_000});
  await page.getByText('📤 خروجی',{exact:true}).click();
  await page.getByRole('button',{name:'ساخت محفظه برای قطعات گچی',exact:true}).click();
  const boxHalves=page.getByRole('button',{name:/^⬇ نیمهٔ [۱۲12] محفظه$/});
  await expect(boxHalves).toHaveCount(4,{timeout:90_000});
  // Switching related tabs must not rebuild the mold and discard derived mother boxes.
  await page.getByText('🧱 قالب',{exact:true}).click();
  await page.getByText('📤 خروجی',{exact:true}).click();
  await expect(boxHalves).toHaveCount(4);
  await page.getByText('🏺 فرم',{exact:true}).click();
  await page.getByText('🔷 الگو',{exact:true}).click();
  await page.getByRole('radio',{name:'لوزی',exact:true}).check();
  await page.getByRole('radio',{name:'موج',exact:true}).check();
  await page.getByText('📤 خروجی',{exact:true}).click();
  await expect(boxHalves).toHaveCount(4);
  const zipButton=page.getByRole('button',{name:'⬇ ZIP ساخت: قطعات، مواد و راهنما',exact:true});
  await expect(zipButton).toBeEnabled({timeout:90_000});
  const downloaded=page.waitForEvent('download',{timeout:90_000});
  await zipButton.click();
  const zip=await downloaded;
  expect(zip.suggestedFilename()).toMatch(/\.zip$/);
  const files=unzipSync(new Uint8Array(await readFile((await zip.path())!)));
  const names=Object.keys(files);
  expect(names).toEqual(expect.arrayContaining(['README.txt','manifest.json','parameters.json','BOM.txt']));
  const manifest=JSON.parse(strFromU8(files['manifest.json']!));
  expect(manifest.units).toBe('mm');expect(manifest.stlValidated).toBe(true);expect(manifest.objValidated).toBe(true);
  for(const item of manifest.files)expect(files[item.path]?.length,item.path).toBe(item.bytes);
  const params=JSON.parse(strFromU8(files['parameters.json']!));
  expect(params.segments).toBe(24);expect(params.pattern.id).toBe('wave');
  expect(params.motherBoxPartsIncluded).toBe(2);
  expect(names.filter((n)=>n.startsWith('mother-box/')&&n.endsWith('.stl'))).toHaveLength(4);
  expect(params.pattern.dxf).toMatchObject({clippedToCanvas:true,bezierToleranceMm:.05});
  const stls=names.filter((n)=>n.endsWith('.stl'));
  expect(stls.some((n)=>n.startsWith('parts/'))).toBe(true);
  for(const name of stls){
    const bytes=files[name]!,view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const triangles=view.getUint32(80,true);expect(triangles).toBeGreaterThan(0);
    expect(bytes.length).toBe(84+50*triangles);
  }
  const project=names.find((n)=>n.endsWith('.patturn'))!;
  expect(JSON.parse(strFromU8(gunzipSync(files[project]!))).state).toMatchObject({segments:24,patternId:'wave'});
  const pdf=names.find((n)=>n.endsWith('.pdf'))!;expect(strFromU8(files[pdf]!.slice(0,5))).toBe('%PDF-');
  const svg=names.find((n)=>n.endsWith('.svg'))!;expect(strFromU8(files[svg]!)).toContain('width="300mm"');
  const dxf=names.find((n)=>n.endsWith('.dxf'))!;expect(new DxfParser().parseSync(strFromU8(files[dxf]!))!.entities.length).toBeGreaterThan(0);
  expect(strFromU8(files['README.txt']!)).toContain('۰٫۰۵mm');
  // Real geometry changes must invalidate both the mold snapshot and its mother boxes.
  await page.getByText('🏺 فرم',{exact:true}).click();
  await segments.fill('28');await segments.press('Tab');
  await page.getByText('📤 خروجی',{exact:true}).click();
  await expect(zipButton).toBeEnabled({timeout:90_000});
  await expect(boxHalves).toHaveCount(0);
  const changedDownload=page.waitForEvent('download',{timeout:90_000});
  await zipButton.click();
  const changedZip=await changedDownload;
  const changedFiles=unzipSync(new Uint8Array(await readFile((await changedZip.path())!)));
  const changedParams=JSON.parse(strFromU8(changedFiles['parameters.json']!));
  expect(changedParams.segments).toBe(28);expect(changedParams.motherBoxPartsIncluded).toBe(0);
  expect(Object.keys(changedFiles).filter((n)=>n.startsWith('mother-box/'))).toHaveLength(0);
  expect(external).toEqual([]);
});
