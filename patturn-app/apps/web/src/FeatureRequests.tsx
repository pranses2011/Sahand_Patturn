import { useEffect, useState } from 'react';
import { FeatureRequestRepo, sortFeatureRequests, type FeatureRequest } from '@patturn/storage';

export function FeatureRequests({
  onExport,
}: {
  onExport: (name: string, bytes: Uint8Array) => void;
}) {
  const [entries, setEntries] = useState<FeatureRequest[]>([]),
    [text, setText] = useState('');
  const [mode, setMode] = useState<'top' | 'new'>('top');
  const [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const repo = () => new FeatureRequestRepo(window.localStorage);
  const perform = (action: () => FeatureRequest[]) => {
    try {
      setEntries(action());
      setError('');
      return true;
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      setMessage('');
      setError(
        code === 'REQUESTS_FULL'
          ? 'فهرست به سقف ۳۰ درخواست رسیده است.'
          : code === 'REQUESTS_DUPLICATE_TEXT'
            ? 'این متن قبلاً در فهرست محلی ثبت شده است.'
            : 'فهرست درخواست‌ها خوانده یا ذخیره نشد؛ دادهٔ قبلی بازنویسی نشده است. دسترسی و محتوای ذخیره را بررسی کنید.',
      );
      return false;
    }
  };
  useEffect(() => {
    perform(() => repo().list());
  }, []);
  return (
    <details className="feature-requests">
      <summary>درخواست قابلیت — فهرست خصوصی این دستگاه</summary>
      <p className="hint">
        تا ۳۰ پیشنهاد، فقط در همین مرورگر یا WebView. ثبت و رأی به سازنده ارسال نمی‌شوند؛ این
        رأی‌گیری عمومی نیست و هر کلیک یک رأی محلی می‌افزاید. اطلاعات محرمانه ننویسید.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (perform(() => repo().add(text))) {
            setText('');
            setMessage(
              'پیشنهاد فقط در فهرست محلی ثبت شد؛ برای ارسال باید فایل را جداگانه به اشتراک بگذارید.',
            );
          }
        }}
      >
        <label>
          متن درخواست قابلیت
          <textarea
            value={text}
            maxLength={240}
            required
            onChange={(event) => setText(event.currentTarget.value)}
          />
        </label>
        <button type="submit" className="btn" disabled={!text.trim()}>
          ثبت پیشنهاد محلی
        </button>
      </form>
      <fieldset>
        <legend>مرتب‌سازی درخواست‌ها</legend>
        <label>
          <input
            type="radio"
            name="feature-request-sort"
            checked={mode === 'top'}
            onChange={() => setMode('top')}
          />
          برترین (Top)
        </label>
        <label>
          <input
            type="radio"
            name="feature-request-sort"
            checked={mode === 'new'}
            onChange={() => setMode('new')}
          />
          جدیدترین (New)
        </label>
      </fieldset>
      <button type="button" className="btn" onClick={() => perform(() => repo().list())}>
        بازخوانی درخواست‌های محلی
      </button>
      <button
        type="button"
        className="btn"
        onClick={() =>
          perform(() => {
            const repository = repo();
            onExport('patturn-local-feature-requests-v1.json', repository.exportDocument());
            return repository.list();
          })
        }
      >
        خروجی JSON درخواست‌ها
      </button>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!error && entries.length === 0 && <p>هنوز پیشنهادی ثبت نشده است.</p>}
      <ol>
        {sortFeatureRequests(entries, mode).map((entry) => (
          <li key={entry.id}>
            <p>{entry.text}</p>
            <span>{new Intl.NumberFormat('fa-IR').format(entry.votes)} رأی محلی</span>
            <button
              type="button"
              className="btn"
              disabled={entry.votes >= 9999}
              aria-label={`افزودن رأی محلی: ${entry.text}`}
              onClick={() => {
                if (perform(() => repo().vote(entry.id)))
                  setMessage('یک رأی محلی افزوده شد؛ به سرور ارسال نشد.');
              }}
            >
              رأی +۱
            </button>
          </li>
        ))}
      </ol>
    </details>
  );
}
