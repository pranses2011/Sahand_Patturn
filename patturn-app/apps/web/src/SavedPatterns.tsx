import { useEffect, useRef, useState } from 'react';
import { PatternLibraryRepo, PATTERN_LIBRARY_KEY, MAX_PATTERN_BACKUP_BYTES, type PatternRecipe } from '@patturn/storage';
import { PATTERNS } from '@patturn/patterns';

export function SavedPatterns({ patternId, tileSize, onApply, onExport }: {
  patternId: string; tileSize: number; onApply: (recipe: PatternRecipe) => void; onExport: (name: string, bytes: Uint8Array) => void;
}) {
  const [entries, setEntries] = useState<PatternRecipe[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const importToken = useRef(0);
  const [importing, setImporting] = useState(false);
  const importFile = async (file: File) => {
    const token = ++importToken.current;
    setImporting(true); setError(null); setImportMessage(null);
    try {
      if (file.size > MAX_PATTERN_BACKUP_BYTES) throw new Error('LIBRARY_BACKUP_TOO_LARGE');
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (token !== importToken.current) return;
      const preview = repo().previewImport(bytes);
      if (window.confirm(`${preview.added} تنظیمات جدید افزوده شود؟ مجموع پس از ادغام: ${preview.total}. موارد یکسان تکرار نمی‌شوند و پروژهٔ باز تغییر نمی‌کند.`)) {
        let added = 0;
        const ok = perform(() => {
          const library = repo();
          const before = library.list().length;
          const entries = library.importDocument(bytes);
          added = entries.length - before;
          return entries;
        });
        if (ok) setImportMessage(`ورود پشتیبان انجام شد؛ ${added} تنظیمات جدید افزوده شد.`);
      } else setImportMessage('ورود پشتیبان لغو شد؛ کتابخانه تغییر نکرد.');
    } catch (e) { if (token === importToken.current) perform(() => { throw e; }); }
    finally { if (token === importToken.current) setImporting(false); }
  };
  const repo = () => new PatternLibraryRepo(window.localStorage, PATTERNS.map((p) => p.id));
  const perform = (action: () => PatternRecipe[]) => {
    try { setEntries(action()); setError(null); return true; }
    catch (e) {
      const code = e instanceof Error ? e.message : '';
      setError(code === 'LIBRARY_NAME_EXISTS'
        ? 'این نام قبلاً ذخیره شده است؛ نام دیگری انتخاب کنید. تنظیمات قبلی تغییر نکرد.'
        : code === 'LIBRARY_IMPORT_CONFLICT'
          ? 'نام یکی از موارد پشتیبان با مقادیر متفاوت در کتابخانه وجود دارد؛ ابتدا نام مورد قبلی را تغییر دهید. چیزی وارد نشد.'
        : code === 'LIBRARY_BACKUP_TOO_LARGE'
          ? 'فایل پشتیبان باید حداکثر ۶۴ KiB باشد؛ چیزی وارد نشد.'
        : code === 'LIBRARY_NOT_FOUND'
          ? 'این تنظیمات دیگر در کتابخانه نیست؛ فهرست را بازخوانی کنید.'
        : code === 'LIBRARY_FULL'
          ? 'کتابخانه به سقف ۳۰ تنظیمات رسیده است؛ برای ذخیرهٔ جدید، ابتدا یکی از موارد قبلی را حذف کنید.'
          : `کتابخانه خوانده یا ذخیره نشد؛ دادهٔ قبلی پاک نشده است: ${String(e).slice(0, 120)}`);
      return false;
    }
  };
  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      // null means localStorage.clear(); never apply a recipe to the project implicitly.
      if (event.key === PATTERN_LIBRARY_KEY || event.key === null) perform(() => repo().list());
    };
    window.addEventListener('storage', refresh);
    return () => {
      importToken.current++; // A late File.arrayBuffer result must not prompt or write after unmount.
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return <details className="saved-patterns" onToggle={(e) => { if (e.currentTarget.open) perform(() => repo().list()); }}>
    <summary>تنظیمات الگوی ذخیره‌شده</summary>
    <p className="hint">حداکثر ۳۰ ترکیب نام‌دار، فقط در همین دستگاه؛ شامل نوع الگو و اندازهٔ کاشی، نه مسیر سفارشی. فایل پروژه فقط تنظیمات فعال را دارد؛ پشتیبان JSON تمام موارد این کتابخانه را نگه می‌دارد. ورود JSON فقط موارد جدید را ادغام می‌کند؛ برخورد نام با مقادیر متفاوت رد می‌شود.</p>
    <form onSubmit={(e) => { e.preventDefault(); if (perform(() => repo().save({ name, patternId, tileSize }))) setName(''); }}>
      <label>نام تنظیمات<input value={name} maxLength={60} required onChange={(e) => setName(e.currentTarget.value)} /></label>
      <button className="btn" type="submit" disabled={!name.trim()}>ذخیرهٔ تنظیمات فعلی</button>
    </form>
    {error && <p className="hint" role="alert">{error}</p>}
    <button className="btn" onClick={() => perform(() => repo().list())}>بازخوانی / تلاش دوباره</button>
    <button className="btn" onClick={() => perform(() => {
      const library = repo();
      onExport('patturn-pattern-library-v1.json', library.exportDocument());
      return library.list();
    })}>دانلود پشتیبان کتابخانهٔ الگو</button>
    <input ref={inputRef} type="file" accept=".json" hidden aria-label="انتخاب پشتیبان کتابخانهٔ الگو" disabled={importing}
      onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void importFile(file); }} />
    <button className="btn" disabled={importing} onClick={() => inputRef.current?.click()}>{importing ? 'در حال خواندن پشتیبان…' : 'ورود پشتیبان کتابخانهٔ الگو'}</button>
    {importing && <button className="btn" onClick={() => {
      importToken.current++; setImporting(false); setImportMessage('ورود پشتیبان لغو شد؛ کتابخانه تغییر نکرد.');
    }}>لغو خواندن پشتیبان</button>}
    {importMessage && <p role="status" className="hint">{importMessage}</p>}
    <ul>{entries.map((entry) => <li key={entry.name}>
      <b>{entry.name}</b> — {entry.tileSize} mm
      <button className="btn" onClick={() => onApply(entry)} aria-label={`اعمال ${entry.name}`}>اعمال</button>
      <button className="btn" onClick={() => {
        if (window.confirm(`نوع الگو و اندازهٔ کاشی فعلی جایگزین تنظیمات «${entry.name}» شود؟`)) {
          perform(() => repo().update(entry.name, { patternId, tileSize }));
        }
      }} aria-label={`به‌روزرسانی ${entry.name} با مقادیر فعلی`}>به‌روزرسانی با مقادیر فعلی</button>
      <button className="btn" onClick={() => {
        const nextName = window.prompt('نام جدید تنظیمات:', entry.name);
        if (nextName !== null) perform(() => repo().rename(entry.name, nextName));
      }} aria-label={`تغییر نام ${entry.name}`}>تغییر نام</button>
      <button className="btn" onClick={() => { if (window.confirm(`تنظیمات «${entry.name}» حذف شود؟`)) perform(() => repo().delete(entry.name)); }} aria-label={`حذف ${entry.name}`}>حذف</button>
    </li>)}</ul>
  </details>;
}
