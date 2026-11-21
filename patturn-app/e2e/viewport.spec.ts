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
  // The software renderer should stop issuing draws once camera damping settles.
  await expect.poll(async()=>page.evaluate(async()=>{
    const state=window as unknown as {testDraws:number};
    const before=state.testDraws;
    await new Promise((resolve)=>setTimeout(resolve,150));
    return state.testDraws-before;
  }),{timeout:10_000}).toBe(0);
  const before=await page.evaluate(()=>(window as unknown as {testDraws:number}).testDraws);
  await page.locator('.viewport canvas').hover();
  await page.mouse.wheel(0,150);
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {testDraws:number}).testDraws)).toBeGreaterThan(before);
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

test('visibility lifecycle suspends software draws during geometry edits and resumes with current state',async({page})=>{
  await page.addInitScript(()=>{
    const proto=WebGL2RenderingContext.prototype;
    const draw=proto.drawElements;
    (window as unknown as {testDraws:number}).testDraws=0;
    proto.drawElements=function(...args:Parameters<WebGL2RenderingContext['drawElements']>){
      (window as unknown as {testDraws:number}).testDraws++;
      return draw.apply(this,args);
    };
  });
  const errors:string[]=[];page.on('pageerror',(error)=>errors.push(error.message));
  await page.goto('/');
  const draws=()=>page.evaluate(()=>(window as unknown as {testDraws:number}).testDraws);
  await expect.poll(draws).toBeGreaterThan(0);
  // Headless Chromium has no OS tab switch: exercise the real listener with a synthetic visibility state.
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByRole('radio',{name:'حرفه‌ای',exact:true}).check();
  const before=await draws();
  const segments=page.getByRole('spinbutton',{name:'تعداد سگمنت',exact:true});
  await segments.fill('32');await segments.press('Enter');
  await expect(page.locator('footer')).toContainText('Segments 32');
  // Include a resize invalidation while paused, not just a geometry update.
  await page.setViewportSize({width:1100,height:800});
  await page.evaluate(()=>new Promise((resolve)=>setTimeout(resolve,200)));
  expect(await draws()).toBe(before);
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(draws).toBeGreaterThan(before);
  await expect(segments).toHaveValue('32');
  await expect(page.locator('.viewport canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('camera reset restores the initial view after zoom without changing project parameters',async({page})=>{
  await page.goto('/');
  const canvas=page.locator('.viewport canvas');await expect(canvas).toBeVisible();
  const reset=page.getByRole('button',{name:'بازنشانی دوربین',exact:true});
  // Compare the canvas region on the same software renderer, keeping overlay focus identical.
  await reset.focus();await page.keyboard.press('Enter');
  const initial=await canvas.screenshot();
  await canvas.hover();await page.mouse.wheel(0,350);
  await expect.poll(async()=>Buffer.compare(await canvas.screenshot(),initial),{timeout:10_000}).not.toBe(0);
  await reset.focus();await page.keyboard.press('Enter');
  await expect.poll(async()=>Buffer.compare(await canvas.screenshot(),initial),{timeout:10_000}).toBe(0);
  await expect(page.getByRole('spinbutton',{name:'ضخامت شعاعی برای ظرفیت',exact:true})).toHaveValue('4');
  await expect(page.getByRole('spinbutton',{name:'شیرینک',exact:true})).toHaveValue('12');
});
