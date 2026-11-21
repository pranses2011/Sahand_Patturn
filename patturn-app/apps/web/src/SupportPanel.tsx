import { useState } from 'react';
import { AUTHOR } from '@patturn/config';

export function SupportPanel() {
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const copy = async () => {
    if (copying) return;
    setCopying(true);
    setMessage('');
    setError(false);
    try {
      await navigator.clipboard.writeText(AUTHOR.cardRaw);
      setMessage('شمارهٔ کارت کپی شد؛ پیش از انتقال وجه، نام گیرنده را در برنامهٔ بانکی بررسی کنید.');
    } catch {
      setError(true);
      setMessage('کپی خودکار در دسترس نیست؛ شمارهٔ نمایش‌داده‌شده را دستی انتخاب و کپی کنید.');
    } finally {
      setCopying(false);
    }
  };
  return (
    <section aria-label="حمایت اختیاری و پشتیبانی" className="hint">
      <h3 className="sec">حمایت اختیاری</h3>
      <p>
        حمایت مالی اختیاری است؛ این بخش پرداخت آنلاین، خرید پلن یا فعال‌سازی لایسنس انجام نمی‌دهد.
      </p>
      <p>شمارهٔ کارت به نام {AUTHOR.name}:</p>
      <p dir="ltr" style={{ userSelect: 'text' }}>
        {AUTHOR.card}
      </p>
      <button
        type="button"
        className="btn"
        disabled={copying}
        onClick={() => {
          void copy();
        }}
      >
        کپی شمارهٔ کارت حمایت
      </button>
      <p>
        کپی فقط شماره را در کلیپ‌بورد دستگاه می‌گذارد؛ انتقال وجه باید جداگانه در برنامهٔ بانکی شما
        انجام شود.
      </p>
      <p role={error ? 'alert' : 'status'}>{message}</p>
      <h3 className="sec">پشتیبانی</h3>
      <p>
        {AUTHOR.name} — {AUTHOR.company}
      </p>
      <p dir="ltr">
        {AUTHOR.phone}
        <br />
        {AUTHOR.email}
        <br />
        {AUTHOR.site}
      </p>
    </section>
  );
}
