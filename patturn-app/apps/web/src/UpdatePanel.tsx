import { useEffect, useRef, useState } from 'react';
import metadata from '../../../package.json';
import { checkForUpdate, RELEASES_URL, type UpdateResult } from './update-check';
export function UpdatePanel() {
  const [result, setResult] = useState<UpdateResult | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [],
  );
  async function check() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    setResult(null);
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const next = await checkForUpdate(metadata.version, controller.signal);
      if (active.current === controller && !controller.signal.aborted) setResult(next);
    } catch {
      if (active.current === controller)
        setError(
          controller.signal.aborted
            ? 'بررسی متوقف شد یا زمان اتصال پایان یافت؛ برنامهٔ محلی همچنان قابل‌استفاده است.'
            : 'بررسی نسخه ناموفق بود؛ اتصال، محدودیت سرویس یا اعتبار پاسخ را بررسی و دوباره تلاش کنید.',
        );
    } finally {
      window.clearTimeout(timeout);
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <details className="update-panel">
      <summary>به‌روزرسانی — بررسی آنلاین اختیاری</summary>
      <p>
        نسخهٔ فعلی: <bdi>{metadata.version}</bdi>
      </p>
      <p className="hint">
        هیچ بررسی خودکاری هنگام اجرا انجام نمی‌شود. با دکمهٔ زیر به API عمومی GitHub وصل می‌شوید؛ IP
        و اطلاعات معمول درخواست برای آن سرویس قابل‌مشاهده است، ولی اطلاعات پروژه یا پروفایل ارسال
        نمی‌شود.
      </p>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() => {
          void check();
        }}
      >
        بررسی نسخهٔ جدید
      </button>
      {busy && (
        <>
          <p role="status">در حال بررسی انتشار پایدار…</p>
          <button type="button" className="btn" onClick={() => active.current?.abort()}>
            لغو بررسی نسخه
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {result?.kind === 'none' && (
        <p role="status">
          انتشار عمومی پایداری در سرویس پیدا نشد؛ این پیام به معنی تأیید آمادگی انتشار نیست.
        </p>
      )}
      {result?.kind === 'current' && (
        <p role="status">
          نسخهٔ پایدار جدیدتری در سرویس پیدا نشد (آخرین برچسب: <bdi>{result.version}</bdi>).
        </p>
      )}
      {result?.kind === 'available' && (
        <div role="status">
          <p>
            نسخهٔ پایدار جدیدتر: <bdi>{result.version}</bdi>
          </p>
          <a href={result.releaseUrl} target="_blank" rel="noopener noreferrer">
            یادداشت‌های انتشار جدید
          </a>
          {result.installers.length ? (
            <ul>
              {result.installers.map((item) => (
                <li key={item.name}>
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    دریافت نصب‌کننده: <bdi>{item.name}</bdi>
                  </a>{' '}
                  —{' '}
                  {new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(
                    item.size / 1024 ** 2,
                  )}{' '}
                  MiB
                </li>
              ))}
            </ul>
          ) : (
            <p>
              نصب‌کنندهٔ EXE/MSI معتبری در اطلاعات انتشار پیدا نشد؛ دانلود خودکار پیشنهاد نمی‌شود.
            </p>
          )}
        </div>
      )}
      <p className="hint">
        لینک‌ها فقط مخزن همین برنامه را باز می‌کنند. فایل خودکار دانلود، نصب یا اجرا نمی‌شود؛ امضا و
        checksum در برنامه بررسی نمی‌شوند. پیش از ارتقا از پروژه‌ها پشتیبان بگیرید و ناشر و هش فایل
        را جداگانه بررسی کنید. آزمون نصب/ارتقای واقعی ویندوز هنوز تأیید نشده است.
      </p>
      <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
        همهٔ انتشارها در GitHub (نیازمند اینترنت)
      </a>
    </details>
  );
}
