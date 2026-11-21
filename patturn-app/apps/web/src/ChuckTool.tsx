import { useMemo, useState } from 'react';
import { buildChuck, validateMesh, CHUCK_TAPER_DEG } from '@patturn/kernel';
import { toBinaryStl, exportName } from '@patturn/exporters';
import { NumericControl } from './NumericControl';

export function ChuckTool({onExport}:{onExport:(name:string,bytes:Uint8Array)=>void}) {
  const [diameter,setDiameter]=useState(80),[height,setHeight]=useState(40),[drain,setDrain]=useState(8);
  const [error,setError]=useState('');
  const geometry=useMemo(()=>{
    try { const mesh=buildChuck({baseDiameter:diameter,height,drainDiameter:drain});return {mesh,report:validateMesh(mesh)}; }
    catch {return null;}
  },[diameter,height,drain]);
  const top=diameter-2*height*Math.tan(CHUCK_TAPER_DEG*Math.PI/180);
  const control=(label:string,value:number,onChange:(n:number)=>void,min:number,max:number)=><NumericControl label={label} value={value}
    onChange={(next)=>{onChange(next);setError('');}} min={min} max={max} unit="mm" onBeginEdit={()=>{}} onEndEdit={()=>{}} />;
  return <details className="chuck-tool">
    <summary>چاک‌ساز — شیب ۲ درجه و سوراخ تخلیه</summary>
    <p className="hint">تکیه‌گاه مخروطی با سوراخ محوریِ عبوری؛ واحد همهٔ ابعاد میلی‌متر است. شیب به سمت بالا باریک می‌شود. این مدل حلقوی توپر است، نه پوستهٔ نازک.</p>
    {control('قطر پایهٔ چاک',diameter,setDiameter,40,200)}
    {control('ارتفاع چاک',height,setHeight,10,100)}
    {control('قطر سوراخ تخلیهٔ چاک',drain,setDrain,4,20)}
    <svg viewBox="-110 -110 220 125" role="img" aria-label="مقطع شماتیک چاک؛ سوراخ محوری در هر دو سر باز است">
      <path d={`M${-diameter/2} 0 L${-top/2} ${-height} H${-drain/2} V0 Z M${diameter/2} 0 L${top/2} ${-height} H${drain/2} V0 Z`} fill="#3f6c7a" />
    </svg>
    <p role="status">قطر بالا: {new Intl.NumberFormat('fa-IR',{maximumFractionDigits:2}).format(top)} میلی‌متر؛ شیب: ۲ درجه؛ {geometry?.report.ok ? 'مش بسته و اعتبارسنجی‌شده؛ سوراخ تخلیه باز است.' : 'هندسه نامعتبر است؛ خروجی مسدود شد.'}</p>
    <p className="hint">تنظیمات این ابزار مستقل و موقتی‌اند و داخل پروژه یا ZIP قالب ذخیره نمی‌شوند. خروجی، آزمون بار، تعادل، سرعت چرخ، چسبندگی یا چاپ واقعی ندارد؛ قبل از استفادهٔ عملی باید جداگانه بررسی شود.</p>
    <button type="button" className="btn" disabled={!geometry?.report.ok} onClick={()=>{
      if(!geometry?.report.ok)return;
      const result=toBinaryStl(geometry.mesh,'chuck-taper-2deg');
      if(!result.ok||!result.bytes){setError('اعتبارسنجی STL چاک ناموفق بود؛ فایلی تحویل نشد.');return;}
      onExport(exportName('chuck','taper2deg',`D${diameter}-H${height}-drain${drain}mm`,'stl'),result.bytes);
    }}>دانلود STL چاک</button>
    {error && <p role="alert">{error}</p>}
  </details>;
}
