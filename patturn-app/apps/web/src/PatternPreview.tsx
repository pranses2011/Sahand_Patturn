import { memo } from 'react';
import type { Path } from '@patturn/patterns';

export type PatternView = 'flat' | 'surface';
export function PatternViewSwitch({ value, onChange }: { value: PatternView; onChange: (value: PatternView) => void }) {
  return <fieldset className="pattern-view-switch">
    <legend>نمای الگو</legend>
    <label><input type="radio" name="pattern-view" value="flat" checked={value === 'flat'} onChange={() => onChange('flat')} /> تخت ۲بعدی</label>
    <label><input type="radio" name="pattern-view" value="surface" checked={value === 'surface'} onChange={() => onChange('surface')} /> روی فرم ۳بعدی</label>
    <p className="hint">نمای روی فرم، بافتِ تکرارشونده و تقریبی است؛ برجستگی یا برش هندسی روی STL ایجاد نمی‌کند. اندازه و تکرار نهایی را با SVG و نمونهٔ فیزیکی کنترل کنید.</p>
  </fieldset>;
}

export const FlatPatternPreview = memo(function FlatPatternPreview({ paths, strokeMm }: { paths: Path[]; strokeMm: number }) {
  return <div className="flat-pattern-preview">
    <svg viewBox="0 0 300 300" role="img" aria-label="پیش‌نمایش تخت الگو روی بوم ۳۰۰ در ۳۰۰ میلی‌متر" overflow="hidden">
      {paths.map((p, i) => <path key={i} d={p.d} fill={p.fill ? '#1c1917' : 'none'}
        stroke={p.fill ? 'none' : '#c4622d'} strokeWidth={strokeMm} strokeLinecap="round" strokeLinejoin="round" />)}
    </svg>
  </div>;
});
