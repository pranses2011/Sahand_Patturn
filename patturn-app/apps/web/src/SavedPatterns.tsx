import { useState } from 'react';
import { PatternLibraryRepo, type PatternRecipe } from '@patturn/storage';
import { PATTERNS } from '@patturn/patterns';

export function SavedPatterns({ patternId, tileSize, onApply }: {
  patternId: string; tileSize: number; onApply: (recipe: PatternRecipe) => void;
}) {
  const [entries, setEntries] = useState<PatternRecipe[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const repo = () => new PatternLibraryRepo(window.localStorage, PATTERNS.map((p) => p.id));
  const perform = (action: () => PatternRecipe[]) => {
    try { setEntries(action()); setError(null); return true; }
    catch (e) { setError(`کتابخانه خوانده یا ذخیره نشد؛ دادهٔ قبلی پاک نشده است: ${String(e).slice(0, 120)}`); return false; }
  };
  return <details className="saved-patterns" onToggle={(e) => { if (e.currentTarget.open) perform(() => repo().list()); }}>
    <summary>تنظیمات الگوی ذخیره‌شده</summary>
    <p className="hint">حداکثر ۳۰ ترکیب نام‌دار، فقط در همین دستگاه؛ شامل نوع الگو و اندازهٔ کاشی، نه مسیر سفارشی. برای نگهداری جداگانه، فایل پروژه را ذخیره کنید.</p>
    <form onSubmit={(e) => { e.preventDefault(); if (perform(() => repo().save({ name, patternId, tileSize }))) setName(''); }}>
      <label>نام تنظیمات<input value={name} maxLength={60} required onChange={(e) => setName(e.currentTarget.value)} /></label>
      <button className="btn" type="submit" disabled={!name.trim()}>ذخیرهٔ تنظیمات فعلی</button>
    </form>
    {error && <p className="hint" role="alert">{error}</p>}
    <button className="btn" onClick={() => perform(() => repo().list())}>بازخوانی / تلاش دوباره</button>
    <ul>{entries.map((entry) => <li key={entry.name}>
      <b>{entry.name}</b> — {entry.tileSize} mm
      <button className="btn" onClick={() => onApply(entry)} aria-label={`اعمال ${entry.name}`}>اعمال</button>
      <button className="btn" onClick={() => { if (window.confirm(`تنظیمات «${entry.name}» حذف شود؟`)) perform(() => repo().delete(entry.name)); }} aria-label={`حذف ${entry.name}`}>حذف</button>
    </li>)}</ul>
  </details>;
}
