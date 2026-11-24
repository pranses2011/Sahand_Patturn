import { useEffect, useState } from 'react';
import { desktopSqliteHistory, isDesktop } from '@patturn/storage';
import { PATTERNS } from '@patturn/patterns';
import { App } from './App';
import type { HistorySession } from './history-session';

/** Do not mount an autosaving editor before desktop history is validated/migrated. */
export function EditorBoot() {
  const [desktop] = useState(isDesktop);
  const [session, setSession] = useState<HistorySession | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    setFailed(false);
    void desktopSqliteHistory(PATTERNS.map((pattern) => pattern.id))
      .then(async (history) => ({
        history,
        entries: await history.importLegacy(() => window.localStorage),
      }))
      .then((next) => {
        if (active) setSession(next);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [desktop, attempt]);
  if (!desktop) return <App />;
  if (session) return <App historySession={session} />;
  return (
    <main dir="rtl">
      {failed ? (
        <div role="alert">
          تاریخچهٔ SQLite دسکتاپ خوانده یا منتقل نشد؛ برای جلوگیری از بازنویسی داده، ادیتور هنوز باز
          نشده است. دادهٔ قبلی حذف نشده و ذخیره به مرورگر تغییر نکرده است.
          <button className="btn" onClick={() => setAttempt((value) => value + 1)}>
            تلاش دوباره برای تاریخچهٔ دسکتاپ
          </button>
        </div>
      ) : (
        <p role="status">در حال خواندن تاریخچهٔ SQLite دسکتاپ…</p>
      )}
    </main>
  );
}
