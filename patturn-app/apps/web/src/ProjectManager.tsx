import { useEffect, useRef, useState } from 'react';
import {
  desktopProjectRepo,
  isDesktop,
  LocalRepo,
  type ProjectRecord,
  type ProjectRepo,
} from '@patturn/storage';
import type { EditorState } from '@patturn/schema';
import { editorProject, projectEditor } from './editor-project';
import { formatNumber } from './number-format';

export function ProjectManager({
  state,
  onApply,
}: {
  state: EditorState;
  onApply: (state: EditorState) => void;
}) {
  const [repo, setRepo] = useState<ProjectRepo | null>(null),
    [entries, setEntries] = useState<ProjectRecord[]>([]);
  const [name, setName] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  const active = useRef(true),
    lock = useRef(false),
    latest = useRef({ state, onApply });
  latest.current = { state, onApply };
  useEffect(() => {
    active.current = true;
    setError('');
    setBusy(true);
    let alive = true;
    void (isDesktop() ? desktopProjectRepo() : Promise.resolve(new LocalRepo()))
      .then(async (next) => ({ next, entries: await next.list() }))
      .then((result) => {
        if (alive) {
          setRepo(result.next);
          setEntries(result.entries);
        }
      })
      .catch(() => {
        if (alive)
          setError(
            'فهرست پروژه‌ها خوانده نشد؛ دادهٔ قبلی بازنویسی نشده است. اتصال و دادهٔ محلی را بررسی کنید.',
          );
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
      active.current = false;
    };
  }, [attempt]);
  async function perform(action: (repo: ProjectRepo) => Promise<void>) {
    if (!repo || busy || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await action(repo);
      const refreshed = await repo.list();
      if (active.current) setEntries(refreshed);
    } catch {
      if (active.current)
        setError(
          'عملیات پروژه انجام نشد یا فهرست تازه خوانده نشد؛ ممکن است نوشتن انجام شده باشد. پیش از تکرار، فهرست را بازخوانی کنید.',
        );
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function open(id: string) {
    if (!repo || busy || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const before = JSON.stringify(latest.current.state);
    try {
      const record = await repo.get(id);
      if (!active.current) return;
      if (!record) throw Error('NOT_FOUND');
      const next = projectEditor(record);
      if (before !== JSON.stringify(latest.current.state)) {
        setError('پارامترها هنگام خواندن پروژه تغییر کردند؛ دوباره بازکردن را درخواست کنید.');
        return;
      }
      if (window.confirm('این پروژه باز شود؟ وضعیت فعلیِ ذخیره‌نشده را ابتدا جداگانه نگه دارید.'))
        latest.current.onApply(next);
    } catch {
      if (active.current)
        setError(
          'پروژه باز نشد؛ ممکن است حذف شده، خراب یا دارای پروفیل/تنظیمات عمومیِ پشتیبانی‌نشده در ادیتور فعلی باشد. دادهٔ آن تغییر نکرد.',
        );
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <>
      <p className="hint">
        {isDesktop() ? 'مخزن SQLite دسکتاپ' : 'مخزن مرورگر همین دستگاه'}؛ ذخیره با نام، پروژهٔ تازه
        با شناسهٔ مستقل می‌سازد. بازکردن، ذخیرهٔ خودکار روی پروژهٔ نام‌دار را فعال نمی‌کند؛ تغییرات
        فعلی را دوباره با نام ذخیره کنید. ابزارهای موقت داخل پروژه نیستند.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const snapshot = { ...state },
            label = name.trim();
          if (!label) return;
          void perform(async (current) => {
            await current.save(editorProject(snapshot, label));
          });
        }}
      >
        <label>
          نام پروژهٔ جدید
          <input
            aria-label="نام پروژهٔ جدید"
            value={name}
            maxLength={200}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </label>
        <button className="btn" disabled={!repo || busy || !name.trim()}>
          ذخیرهٔ وضعیت فعلی با نام
        </button>
      </form>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() => {
          setRepo(null);
          setAttempt((n) => n + 1);
        }}
      >
        بازخوانی فهرست پروژه‌ها
      </button>
      {isDesktop() && (
        <button
          type="button"
          className="btn"
          disabled={!repo || busy || entries.length > 0}
          onClick={() => {
            if (
              !window.confirm(
                'پروژه‌های مرورگر همین نصب به SQLite خالی کپی شوند؟ منبع حذف نمی‌شود.',
              )
            )
              return;
            void perform(async (current) => {
              if (!('importIntoEmpty' in current) || typeof current.importIntoEmpty !== 'function')
                throw Error('PROJECT_IMPORT_UNAVAILABLE');
              const source = await new LocalRepo().list();
              await current.importIntoEmpty(source);
            });
          }}
        >
          کپی پروژه‌های مرورگر به SQLite خالی
        </button>
      )}
      <p role="status">
        {busy ? 'در حال خواندن/نوشتن پروژه…' : `${formatNumber(entries.length)} پروژه`}
      </p>
      {error && <p role="alert">{error}</p>}
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <b>{entry.name}</b>{' '}
            <button
              type="button"
              className="btn"
              disabled={busy || !repo}
              onClick={() => void open(entry.id)}
            >
              بازکردن {entry.name}
            </button>{' '}
            <button
              type="button"
              className="btn"
              disabled={busy || !repo}
              onClick={() => {
                const label = window.prompt('نام نسخهٔ تکثیرشده', `${entry.name} — کپی`);
                if (label?.trim())
                  void perform(async (current) => {
                    await current.duplicate(entry.id, label.trim());
                  });
              }}
            >
              تکثیر {entry.name}
            </button>{' '}
            <button
              type="button"
              className="btn"
              disabled={busy || !repo}
              onClick={() => {
                if (
                  window.confirm(
                    `پروژهٔ «${entry.name}» از این مخزن حذف شود؟ تاریخچهٔ ادیتور حذف نمی‌شود.`,
                  )
                )
                  void perform((current) => current.delete(entry.id));
              }}
            >
              حذف {entry.name}
            </button>
          </li>
        ))}
      </ul>
      <p className="hint">
        پروژه‌های با پروفیل یا تنظیمات عمومی خارج از زیرمجموعهٔ ادیتور فعلی، بی‌صدا ساده‌سازی
        نمی‌شوند و بازکردنشان رد می‌شود. انتقال خودکار انجام نمی‌شود؛ کپی دستی فقط از دادهٔ مرورگر
        همین نصب به SQLite خالی ممکن است و منبع را حذف نمی‌کند. مخزن مرورگر خارجی در دسترس این نصب
        نیست.
      </p>
    </>
  );
}
