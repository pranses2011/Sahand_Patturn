import { memo, useMemo } from 'react';
import { PATTERNS, type PatternDef } from '@patturn/patterns';

const NAMES: Record<string, string> = {
  'dot-grid': 'شبکهٔ نقطه‌ای', stripes: 'راه‌راه', grid: 'شبکهٔ مربعی',
  chevron: 'زیگزاگ', hex: 'شش‌ضلعی', scale: 'فلس', wave: 'موج', diamond: 'لوزی',
};

const PatternCard = memo(function PatternCard({ pattern, selected, onSelect }: {
  pattern: PatternDef; selected: boolean; onSelect: (id: string) => void;
}) {
  // Fixed physical sample, independent of editor tile size; never builds the full 300 mm canvas.
  const paths = useMemo(() => pattern.build({ canvasW: 80, canvasH: 80, tileW: 40, tileH: 40,
    seed: 42, params: { ...pattern.defaults } }), [pattern]);
  return <label className={`pattern-card${selected ? ' selected' : ''}`}>
    <input type="radio" name="pattern-library" value={pattern.id} checked={selected}
      onChange={() => onSelect(pattern.id)} />
    <span>{NAMES[pattern.id] ?? pattern.label}</span>
    <svg viewBox="0 0 80 80" aria-hidden="true" focusable="false" overflow="hidden">
      {paths.map((path, i) => <path key={i} d={path.d} fill={path.fill ? 'currentColor' : 'none'}
        stroke={path.fill ? 'none' : 'currentColor'} strokeWidth={1.5} />)}
    </svg>
  </label>;
});

export function PatternLibrary({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  return <fieldset className="pattern-library">
    <legend>الگوهای آماده</legend>
    <p className="hint">نمونه‌ها: بوم ۸۰×۸۰ و کاشی ۴۰ میلی‌متر؛ اندازهٔ واقعی پروژه از کنترل کاشی تنظیم می‌شود.</p>
    <div className="pattern-cards">{PATTERNS.map((pattern) => <PatternCard key={pattern.id}
      pattern={pattern} selected={selectedId === pattern.id} onSelect={onSelect} />)}</div>
  </fieldset>;
}
