import { useEffect, useId, useState } from 'react';
import { ParameterHelp, type HelpTopic } from './ParameterHelp';

export function normalizeControlValue(n: number, min: number, max: number, step: number): number {
  return Math.min(max, Math.max(min, Number((Math.round(n / step) * step).toFixed(8))));
}

export function NumericControl({label,value,onChange,min,max,step=1,unit='mm',help,onBeginEdit,onEndEdit}: {
  label:string;value:number;onChange:(n:number)=>void;min:number;max:number;step?:number;unit?:string;help?:HelpTopic;
  onBeginEdit:()=>void;onEndEdit:()=>void;
}) {
  const id=useId();
  const [draft,setDraft]=useState(String(value));
  useEffect(()=>setDraft(String(value)),[value]);
  const commit=(input:HTMLInputElement)=>{
    const n=input.valueAsNumber;
    if(Number.isFinite(n)){
      const next=normalizeControlValue(n,min,max,step);setDraft(String(next));
      if(next!==value)onChange(next);
    }else setDraft(String(value));
    onEndEdit();
  };
  return <div className="ctl">
    <label htmlFor={id}><span>{label}</span><span className="val">{value} {unit}</span></label>
    <input id={id} aria-label={label} className="num" type="number" value={draft} min={min} max={max} step={step}
      onFocus={onBeginEdit} onChange={(event)=>setDraft(event.currentTarget.value)}
      onBlur={(event)=>commit(event.currentTarget)} onKeyDown={(event)=>{
        if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}
        if(event.key==='Escape'){
          event.preventDefault();event.currentTarget.value=String(value);setDraft(String(value));event.currentTarget.blur();
        }
      }} />
    <input type="range" aria-label={label} min={min} max={max} step={step} value={value}
      onPointerDown={onBeginEdit} onPointerUp={onEndEdit} onPointerCancel={onEndEdit} onBlur={onEndEdit}
      onKeyDown={(event)=>{if(!event.repeat && /^(Arrow|Home|End|Page)/.test(event.key))onBeginEdit();}}
      onKeyUp={onEndEdit}
      onChange={(event)=>{const n=event.currentTarget.valueAsNumber;if(Number.isFinite(n))onChange(normalizeControlValue(n,min,max,step));}} />
    {help && <ParameterHelp topic={help} />}
  </div>;
}
