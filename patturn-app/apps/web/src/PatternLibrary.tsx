import { normalizePatternSearch } from './pattern-search';
export { normalizePatternSearch } from './pattern-search';
import { PATTERN_NAMES_FA as NAMES } from '@patturn/config';
import { memo, useMemo, useRef, useState } from 'react';
import { PATTERNS, type PatternDef } from '@patturn/patterns';

const PatternCard = memo(function PatternCard({
  pattern,
  selected,
  onSelect,
}: {
  pattern: PatternDef;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  // Fixed physical sample, independent of editor tile size; never builds the full 300 mm canvas.
  const paths = useMemo(
    () =>
      pattern.build({
        canvasW: 80,
        canvasH: 80,
        tileW: 40,
        tileH: 40,
        seed: 42,
        params: { ...pattern.defaults },
      }),
    [pattern],
  );
  return (
    <label className={`pattern-card${selected ? ' selected' : ''}`}>
      <input
        type="radio"
        name="pattern-library"
        value={pattern.id}
        checked={selected}
        onChange={() => onSelect(pattern.id)}
      />
      <span>{NAMES[pattern.id] ?? pattern.label}</span>
      <svg viewBox="0 0 80 80" aria-hidden="true" focusable="false" overflow="hidden">
        {paths.map((path, i) => (
          <path
            key={i}
            d={path.d}
            fill={path.fill ? 'currentColor' : 'none'}
            stroke={path.fill ? 'none' : 'currentColor'}
            strokeWidth={1.5}
          />
        ))}
      </svg>
    </label>
  );
});

export function filterPatterns(query: string): PatternDef[] {
  const words = normalizePatternSearch(query).split(' ').filter(Boolean);
  return PATTERNS.filter((pattern) => {
    const text = normalizePatternSearch(
      `${NAMES[pattern.id] ?? ''} ${pattern.label} ${pattern.id}`,
    );
    return words.every((word) => text.includes(word));
  });
}

export const PatternLibrary = memo(function PatternLibrary({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => filterPatterns(query), [query]);
  const selectedHidden = !visible.some((pattern) => pattern.id === selectedId);
  return (
    <fieldset className="pattern-library">
      <legend>الگوهای آماده</legend>
      <p className="hint">
        نمونه‌ها: بوم ۸۰×۸۰ و کاشی ۴۰ میلی‌متر؛ اندازهٔ واقعی پروژه از کنترل کاشی تنظیم می‌شود.
      </p>
      <label>
        جست‌وجوی الگو{' '}
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </label>
      {query && (
        <button
          type="button"
          className="btn"
          onClick={() => {
            setQuery('');
            searchRef.current?.focus();
          }}
        >
          پاک‌کردن جست‌وجو
        </button>
      )}
      <p role="status">
        {visible.length} الگو از {PATTERNS.length} — جست‌وجو انتخاب پروژه را تغییر نمی‌دهد.
      </p>
      {selectedHidden && (
        <div className="hint">
          <p>
            الگوی فعال «{NAMES[selectedId] ?? selectedId}» در نتایج جست‌وجو پنهان است؛ انتخاب پروژه
            تغییر نکرده است.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setQuery('');
              searchRef.current?.focus();
            }}
          >
            نمایش الگوی فعال
          </button>
        </div>
      )}
      {visible.length === 0 && (
        <p className="hint">الگویی پیدا نشد؛ نام فارسی، انگلیسی یا شناسه را امتحان کنید.</p>
      )}
      <div className="pattern-cards">
        {visible.map((pattern) => (
          <PatternCard
            key={pattern.id}
            pattern={pattern}
            selected={selectedId === pattern.id}
            onSelect={onSelect}
          />
        ))}
      </div>
    </fieldset>
  );
});
