import { useMemo, useState } from 'react';
import { buildJigsaw } from '@patturn/patterns';
import { exportName, toSvg, toDxf } from '@patturn/exporters';
import { NumericControl } from './NumericControl';

export function JigsawTool({onExport}:{onExport:(name:string,bytes:Uint8Array)=>void}) {
  const [rows,setRows]=useState(3),[columns,setColumns]=useState(3),[cell,setCell]=useState(40),[tab,setTab]=useState(3),[seed,setSeed]=useState(42);
  const [error,setError]=useState('');
  const drawing=useMemo(()=>buildJigsaw({rows,columns,cellMm:cell,tabMm:tab,seed}),[rows,columns,cell,tab,seed]);
  const control=(label:string,value:number,set:(n:number)=>void,min:number,max:number,unit='mm')=><NumericControl label={label} value={value}
    min={min} max={max} unit={unit} onChange={(n)=>{set(n);setError('');}} onBeginEdit={()=>{}} onEndEdit={()=>{}} />;
  const download=(format:'svg'|'dxf')=>{
    const output=format==='svg' ? toSvg(drawing.paths,drawing.width,drawing.height,{strokeMm:.2})
      : toDxf(drawing.paths,{width:drawing.width,height:drawing.height},{bezierToleranceMm:.05});
    if(!output.ok||!output.bytes){setError('تولید خروجی پازل ناموفق بود؛ پارامترها را بررسی کنید.');return;}
    onExport(exportName('jigsaw',`${rows}x${columns}`,`cell${cell}-tab${tab}-seed${seed}mm`,format),output.bytes);
  };
  return <details className="jigsaw-tool">
    <summary>الگوی پازل — اتصال jigsaw با seed قطعی</summary>
    <p className="hint">نقشهٔ خطوط برش مشترک؛ هر مرز داخلی فقط یک‌بار رسم می‌شود، نه کانتور جداگانهٔ هر قطعه. واحد ابعاد میلی‌متر است.</p>
    {control('تعداد سطرهای پازل',rows,setRows,2,6,'سطر')}
    {control('تعداد ستون‌های پازل',columns,setColumns,2,6,'ستون')}
    {control('اندازهٔ خانهٔ پازل',cell,(n)=>{setCell(n);setTab((value)=>Math.min(value,Math.floor(n/6)));},20,60)}
    {control('عمق زبانهٔ پازل',tab,setTab,1,Math.floor(cell/6))}
    {control('seed پازل',seed,setSeed,0,65535,'seed')}
    <svg viewBox={`0 0 ${drawing.width} ${drawing.height}`} role="img" aria-label="پیش‌نمایش خطوط برش الگوی پازل" style={{width:'100%'}}>
      {drawing.paths.map((path,index)=><path key={index} d={path.d} fill="none" stroke="currentColor" strokeWidth="0.2" />)}
    </svg>
    <p role="status">ابعاد بوم: {new Intl.NumberFormat('fa-IR').format(drawing.width)} × {new Intl.NumberFormat('fa-IR').format(drawing.height)} میلی‌متر؛ شکل اتصال با seed یکسان ثابت می‌ماند.</p>
    <button type="button" className="btn" onClick={()=>download('svg')}>دانلود SVG پازل</button>
    <button type="button" className="btn" onClick={()=>download('dxf')}>دانلود DXF پازل</button>
    <p className="hint">تنظیمات مستقل و موقتی‌اند و در پروژه یا ZIP قالب نیستند. DXF منحنی‌ها را با تلورانس ۰٫۰۵ میلی‌متر پیش از برش بوم تقریب می‌زند. جبران پهنای برش، لقی، ضخامت ورق و اتصال فیزیکی لحاظ نشده‌اند؛ آزمون CAD و برش واقعی لازم است.</p>
    {error && <p role="alert">{error}</p>}
  </details>;
}
