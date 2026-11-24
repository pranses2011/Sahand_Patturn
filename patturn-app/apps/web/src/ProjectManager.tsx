import { nativeProjectCloseGuard } from './native-project-close';
import { projectClose as closeText } from './messages/fa.json';
import {
  projectConcurrency as concurrencyText,
  projectMetadata as metadataText,
} from './messages/fa.json';
import { useEffect, useRef, useState } from 'react';
import {
  desktopProjectRepo,
  isDesktop,
  LocalRepo,
  projectWriteLockSupported,
  parseProject,
  serializeProject,
  renamedProject,
  type ProjectRecord,
  type ProjectRepo,
} from '@patturn/storage';
import type { EditorState } from '@patturn/schema';
import { editorProject, projectEditor, updatedEditorProject } from './editor-project';
import { formatNumber } from './number-format';

export function ProjectManager({
  state,
  onApply,
  onExport,
}: {
  state: EditorState;
  onApply: (state: EditorState) => void;
  onExport: (filename: string, bytes: Uint8Array) => void;
}) {
  const [repo, setRepo] = useState<ProjectRepo | null>(null),
    [entries, setEntries] = useState<ProjectRecord[]>([]);
  const [opened, setOpened] = useState<ProjectRecord | null>(null);
  const [autoSave, setAutoSave] = useState(false);
  const [name, setName] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [closeGuardStatus, setCloseGuardStatus] = useState<'loading' | 'ready' | 'failed'>(
    'loading',
  );
  const [closeGuardAttempt, setCloseGuardAttempt] = useState(0);
  const closeWarning = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
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
    } catch (cause) {
      if (active.current) setAutoSave(false);
      if (active.current)
        setError(
          cause instanceof Error && cause.message === 'PROJECT_UPDATE_CONFLICT'
            ? 'تعارض ذخیره: پروژه پس از خواندن تغییر کرده یا حذف شده است؛ عملیات شما انجام نشد. فهرست را بازخوانی کنید؛ برای حفظ تغییرات ادیتور می‌توانید با نام تازه ذخیره کنید.'
            : 'عملیات پروژه انجام نشد یا فهرست تازه خوانده نشد؛ ممکن است نوشتن انجام شده باشد. پیش از تکرار، فهرست را بازخوانی کنید.',
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
      if (window.confirm('این پروژه باز شود؟ وضعیت فعلیِ ذخیره‌نشده را ابتدا جداگانه نگه دارید.')) {
        setAutoSave(false);
        latest.current.onApply(next);
        setOpened(record);
      }
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
  const dirty = opened !== null && JSON.stringify(projectEditor(opened)) !== JSON.stringify(state);
  useEffect(() => {
    if (!autoSave || !opened || !repo || busy || !dirty) return;
    const previous = opened,
      snapshot = { ...state };
    const timer = window.setTimeout(() => {
      void perform(async (current) => {
        const next = updatedEditorProject(previous, snapshot);
        await current.updateIfUnchanged(previous, next);
        if (active.current) setOpened(next);
      });
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [autoSave, opened, repo, busy, dirty, state]);
  closeWarning.current = dirty;
  useEffect(() => {
    if (!isDesktop()) return;
    let alive = true;
    const stop = nativeProjectCloseGuard(
      () => closeWarning.current || lock.current,
      () => {
        if (alive) setCloseGuardStatus('failed');
      },
      () => {
        if (alive) setCloseGuardStatus('ready');
      },
    );
    return () => {
      alive = false;
      stop();
    };
  }, [closeGuardAttempt]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  return (
    <>
      <p className="hint">
        {isDesktop() ? 'مخزن SQLite دسکتاپ' : 'مخزن مرورگر همین دستگاه'}؛ ذخیره با نام، پروژهٔ تازه
        با شناسهٔ مستقل می‌سازد. بازکردن به‌تنهایی ذخیرهٔ خودکار را فعال نمی‌کند؛ تغییرات فعلی را با
        نام تازه یا دکمهٔ ذخیرهٔ پروژهٔ بازشده نگه دارید. ابزارهای موقت داخل پروژه نیستند.
      </p>
      {!isDesktop() && (
        <p className="hint">
          {projectWriteLockSupported() ? concurrencyText.supported : concurrencyText.unsupported}
        </p>
      )}
      {isDesktop() && (
        <div>
          <p role="status" aria-label={closeText.status}>
            {closeGuardStatus === 'ready'
              ? closeText.ready
              : closeGuardStatus === 'loading'
                ? closeText.loading
                : closeText.failed}
          </p>
          {closeGuardStatus === 'failed' && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setCloseGuardStatus('loading');
                setCloseGuardAttempt((value) => value + 1);
              }}
            >
              {closeText.retry}
            </button>
          )}
        </div>
      )}
      {opened && (
        <div>
          <p>پروژهٔ بازشده: {opened.name}</p>
          <label>
            <input
              type="checkbox"
              aria-describedby="named-project-autosave-help"
              checked={autoSave}
              disabled={!repo || busy}
              onChange={(event) => setAutoSave(event.currentTarget.checked)}
            />
            ذخیرهٔ خودکار پروژهٔ بازشده پس از ۲ ثانیه مکث
          </label>
          <p role="status" aria-label="وضعیت تغییرات پروژهٔ بازشده">
            {dirty
              ? 'تغییرات پروژهٔ نام‌دار هنوز ذخیره نشده‌اند.'
              : 'پارامترها با نسخهٔ ذخیره‌شدهٔ پروژهٔ بازشده یکسان‌اند.'}
          </p>
          <p className="hint" id="named-project-autosave-help">
            ذخیرهٔ خودکار {autoSave ? 'فعال' : 'خاموش'} است؛ خطا یا تعارض آن را خاموش می‌کند.
            خاموش‌کردن، نوشتن شروع‌شده را لغو نمی‌کند. بستن برنامه تضمین ذخیرهٔ آخرین تغییر را ندارد.
          </p>
          <button
            type="button"
            className="btn"
            disabled={!repo || busy}
            onClick={() => {
              const previous = opened,
                snapshot = { ...state };
              if (!window.confirm(`تغییرات فعلی در پروژهٔ «${previous.name}» ذخیره شوند؟`)) return;
              void perform(async (current) => {
                const next = updatedEditorProject(previous, snapshot);
                await current.updateIfUnchanged(previous, next);
                if (active.current) setOpened(next);
              });
            }}
          >
            ذخیرهٔ تغییرات در پروژهٔ بازشده
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              setAutoSave(false);
              setOpened(null);
              nameInput.current?.focus();
            }}
          >
            پایان ارتباط با پروژهٔ نام‌دار
          </button>
          <p className="hint">
            اگر پروژه در مخزن تغییر یا حذف شده باشد، ذخیره رد می‌شود؛ ابتدا با نام تازه ذخیره کنید
            یا نسخهٔ مخزن را دوباره باز کنید.
          </p>
        </div>
      )}
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
            ref={nameInput}
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
          setAutoSave(false);
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
      <label>
        ورود فایل پروژهٔ نام‌دار
        <input
          type="file"
          accept=".patturn,application/json"
          aria-describedby="named-project-file-help"
          disabled={!repo || busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (!file) return;
            void perform(async (current) => {
              if (file.size > 2 * 1024 * 1024) throw Error('PROJECT_FILE_TOO_LARGE');
              const record = parseProject(await file.text());
              const empty = (await current.list()).length === 0;
              if (!active.current) return;
              const message = empty
                ? `پروژهٔ «${record.name}» با شناسهٔ اصلی به مخزن خالی وارد شود؟ ادیتور تغییر نمی‌کند.`
                : `پروژهٔ «${record.name}» به‌صورت کپی با شناسه و زمان تازه وارد شود؟ پروژه‌های موجود و ادیتور تغییر نمی‌کنند.`;
              if (!window.confirm(message)) return;
              if (empty) {
                if (
                  !('importIntoEmpty' in current) ||
                  typeof current.importIntoEmpty !== 'function'
                )
                  throw Error('PROJECT_IMPORT_UNAVAILABLE');
                await current.importIntoEmpty([record]);
              } else {
                if (!('importCopy' in current) || typeof current.importCopy !== 'function')
                  throw Error('PROJECT_IMPORT_UNAVAILABLE');
                await current.importCopy(record);
              }
            });
          }}
        />
      </label>
      <p className="hint" id="named-project-file-help">
        این فایل مربوط به پروژهٔ نام‌دار است، نه فایل وضعیت ادیتور. در مخزن خالی شناسه حفظ می‌شود؛ در
        مخزن غیرخالی یک کپی با شناسه و زمان تازه ساخته می‌شود. هیچ پروژه‌ای جایگزین و پروژهٔ واردشده
        خودکار باز نمی‌شود.
      </p>
      <p role="status" aria-label="وضعیت فهرست پروژه‌ها">
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
              onClick={() => {
                const label = window.prompt(metadataText.prompt, entry.name);
                if (label === null || !label.trim() || label.trim() === entry.name) return;
                void perform(async (current) => {
                  const next = renamedProject(entry, label);
                  await current.updateIfUnchanged(entry, next);
                  if (
                    active.current &&
                    opened?.id === entry.id &&
                    JSON.stringify(opened) === JSON.stringify(entry)
                  )
                    setOpened(next);
                });
              }}
            >
              {metadataText.rename} {entry.name}
            </button>{' '}
            <button
              type="button"
              className="btn"
              disabled={busy || !repo}
              onClick={() =>
                void perform(async (current) => {
                  const record = await current.get(entry.id);
                  if (!record) throw Error('NOT_FOUND');
                  const bytes = new TextEncoder().encode(serializeProject(record));
                  if (active.current) onExport('named-project.patturn', bytes);
                })
              }
            >
              خروجی فایل {entry.name}
            </button>{' '}
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
                  void perform(async (current) => {
                    await current.deleteIfUnchanged(entry);
                    if (active.current && opened?.id === entry.id) {
                      setAutoSave(false);
                      setOpened(null);
                    }
                  });
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
