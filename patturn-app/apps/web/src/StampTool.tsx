import { useEffect, useRef, useState } from 'react';
import type { Mesh } from '@patturn/kernel';
import { buildConvexStamp, initCsg } from '@patturn/molds';
import { toBinaryStl, exportName } from '@patturn/exporters';
import { NumericControl } from './NumericControl';
export function StampTool({
  contours,
  onExport,
}: {
  contours: readonly (readonly (readonly [number, number])[])[];
  onExport: (name: string, bytes: Uint8Array) => void;
}) {
  const [base, setBase] = useState(3),
    [relief, setRelief] = useState(2),
    [minimum, setMinimum] = useState(1),
    [mirror, setMirror] = useState(true);
  const [result, setResult] = useState<Mesh | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const token = useRef(0);
  useEffect(() => {
    token.current++;
    setResult(null);
    setError('');
    setBusy(false);
    return () => {
      token.current++;
    };
  }, [contours, base, relief, minimum, mirror]);
  async function build() {
    if (busy) return;
    const request = ++token.current;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      await initCsg();
      if (request !== token.current) return;
      const mesh = buildConvexStamp(contours, {
        baseMm: base,
        reliefMm: relief,
        minWidthMm: minimum,
        mirror,
      });
      if (request === token.current) setResult(mesh);
    } catch {
      if (request === token.current)
        setError(
          'مهر ساخته نشد؛ طرح باید شامل کانتورهای محدبِ بدون سوراخ با جعبه‌های جدا و عرض کافی باشد (حداکثر ۳۲ شکل/۱۰۲۴ رأس و ابعاد طرح ۲۰۰mm). بارگذاری WASM را هم بررسی کنید. نتیجهٔ ردیابی تغییر نکرد.',
        );
    } finally {
      if (request === token.current) setBusy(false);
    }
  }
  const control = (
    label: string,
    value: number,
    set: (n: number) => void,
    min: number,
    max: number,
  ) => (
    <NumericControl
      label={label}
      value={value}
      onChange={set}
      min={min}
      max={max}
      step={0.5}
      onBeginEdit={() => {}}
      onEndEdit={() => {}}
    />
  );
  return (
    <details className="stamp-tool">
      <summary>مهرساز — برجسته‌سازی کانتور محدب</summary>
      <p className="hint">
        از کانتورهای فعلی ردیابی، برجستگی روی پایه ساخته می‌شود؛ ناحیهٔ تیره برجسته است، نه توخالی.
        مقطع مقعر، حروف سوراخ‌دار و جعبه‌های متداخل رد می‌شوند. شکل SVG دلخواه یا متن مستقیم فعلاً
        ورودی ندارد.
      </p>
      {control('ضخامت پایهٔ مهر', base, setBase, 2, 10)}
      {control('ارتفاع برجستگی مهر', relief, setRelief, 1, 8)}
      {control('حداقل عرض هندسی مهر', minimum, setMinimum, 1, 5)}
      <label>
        <input
          type="checkbox"
          checked={mirror}
          onChange={(event) => setMirror(event.currentTarget.checked)}
        />
        آینه‌سازی X برای اثر مهر
      </label>
      <button
        type="button"
        className="btn"
        disabled={busy || !contours.length}
        onClick={() => {
          void build();
        }}
      >
        {busy ? 'در حال ساخت مهر…' : 'ساخت مهر از کانتور فعلی'}
      </button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div role="status">
          مهر متصل و مش معتبر ساخته شد.
          <button
            type="button"
            className="btn"
            onClick={() => {
              const output = toBinaryStl(result, 'convex-stamp');
              if (!output.ok || !output.bytes) {
                setError('STL مهر معتبر نیست.');
                return;
              }
              onExport(
                exportName(
                  'stamp',
                  mirror ? 'mirrored' : 'direct',
                  `B${base}-R${relief}-W${minimum}mm`,
                  'stl',
                ),
                output.bytes,
              );
            }}
          >
            دانلود STL مهر
          </button>
        </div>
      )}
      <p className="hint">
        حداقل عرض یعنی کمترین فاصلهٔ دو خط تکیه‌گاهی موازیِ هر شکل محدب، نه تضمین ضخامت نوک گوشه‌ها یا
        عرض پس از چاپ. پایه در XY با حاشیهٔ ۳mm و برجستگی در +Z است؛ دو جامد ۰٫۱mm هم‌پوشانی و union
        دارند. دسته، شیب جدایش، جبران انقباض و تأیید چاپ/اثرگذاری فیزیکی وجود ندارد. خروجی موقت و
        مستقل از پروژه/ZIP است؛ تغییر کانتور یا تنظیمات نتیجه را باطل می‌کند.
      </p>
    </details>
  );
}
