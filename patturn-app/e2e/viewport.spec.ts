import { test, expect } from '@playwright/test';

test('software WebGL issues geometry draw calls and survives flat/surface remounts',async({page})=>{
  const errors:string[]=[];page.on('pageerror',(error)=>errors.push(error.message));
  // Observe successful drawing without serializing a canvas or requiring preserveDrawingBuffer.
  await page.addInitScript(()=>{
    const proto=WebGL2RenderingContext.prototype;
    const draw=proto.drawElements;
    (window as unknown as {testDraws:number}).testDraws=0;
    proto.drawElements=function(...args:Parameters<WebGL2RenderingContext['drawElements']>){
      (window as unknown as {testDraws:number}).testDraws++;
      return draw.apply(this,args);
    };
  });
  await page.goto('/');
  await expect(page.locator('.viewport canvas')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {testDraws:number}).testDraws)).toBeGreaterThan(0);
  await page.getByText('🔷 الگو',{exact:true}).click();
  for(let i=0;i<3;i++){
    await expect(page.locator('.viewport canvas')).toHaveCount(0);
    await page.getByRole('radio',{name:'روی فرم ۳بعدی',exact:true}).check();
    await expect(page.locator('.viewport canvas')).toBeVisible();
    await expect(page.getByRole('alert').filter({hasText:'نمایش سه‌بعدی در دسترس نیست'})).toHaveCount(0);
    await page.getByRole('radio',{name:'تخت ۲بعدی',exact:true}).check();
  }
  expect(errors).toEqual([]);
});

test('actual software WebGL context loss shows recovery and retry preserves parameters',async({page})=>{
  await page.goto('/');
  const canvas=page.locator('.viewport canvas');await expect(canvas).toBeVisible();
  const wall=page.locator('.ctl').filter({hasText:'ضخامت شعاعی برای ظرفیت'}).locator('input.num');
  await wall.fill('6');await wall.press('Tab');
  const lost=await canvas.evaluate((element)=>{
    const gl=(element as HTMLCanvasElement).getContext('webgl2');
    const extension=gl?.getExtension('WEBGL_lose_context');
    if(!extension)return false;
    extension.loseContext();return true;
  });
  expect(lost,'software renderer must support WEBGL_lose_context for this test').toBe(true);
  await expect(page.getByRole('alert').filter({hasText:'نمایش سه‌بعدی در دسترس نیست'})).toBeVisible();
  await expect(wall).toHaveValue('6');
  await page.getByRole('button',{name:'تلاش دوباره برای نمایش سه‌بعدی',exact:true}).click();
  await expect(canvas).toBeVisible();await expect(wall).toHaveValue('6');
});
