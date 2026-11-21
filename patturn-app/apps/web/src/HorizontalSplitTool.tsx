import { useEffect, useRef, useState } from 'react';
import type { Mesh } from '@patturn/kernel';
import { initCsg, splitHorizontal } from '@patturn/molds';
import { toBinaryStl, exportName } from '@patturn/exporters';
import { NumericControl } from './NumericControl';

export function HorizontalSplitTool({
  mesh,
  onExport,
}: {
  mesh: Mesh | null;
  onExport: (name: string, bytes: Uint8Array) => void;
}) {
  const [height, setHeight] = useState(50),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [result, setResult] = useState<ReturnType<typeof splitHorizontal> | null>(null);
  const token = useRef(0);
  useEffect(() => {
    token.current++;
    setResult(null);
    setBusy(false);
    setError('');
    return () => {
      token.current++;
    };
  }, [mesh, height]);
  let min = Infinity,
    max = -Infinity;
  if (mesh)
    for (let i = 1; i < mesh.positions.length; i += 3) {
      min = Math.min(min, mesh.positions[i]!);
      max = Math.max(max, mesh.positions[i]!);
    }
  const low = Math.ceil(min + 0.1),
    high = Math.floor(max - 0.1);
  const valid = !!mesh && height >= low && height <= high;
  const build = async () => {
    if (!mesh || !valid || busy) return;
    const request = ++token.current;
    setBusy(true);
    setResult(null);
    setError('');
    try {
      await initCsg();
      if (request !== token.current) return;
      const parts = splitHorizontal(mesh, height);
      if (request === token.current) setResult(parts);
    } catch {
      if (request === token.current)
        setError('تقسیم افقی ناموفق بود؛ فرم اصلی تغییر نکرد. ارتفاع را بررسی و دوباره تلاش کنید.');
    } finally {
      if (request === token.current) setBusy(false);
    }
  };
  const download = (side: 'lower' | 'upper') => {
    if (!result) return;
    const output = toBinaryStl(result[side], `horizontal-${side}`);
    if (!output.ok || !output.bytes) {
      setError('اعتبارسنجی قطعه ناموفق بود؛ خروجی مسدود شد.');
      return;
    }
    onExport(exportName('form', `horizontal-${side}`, `Y${height}mm`, 'stl'), output.bytes);
  };
  return (
    <details className="horizontal-split-tool">
      <summary>تقسیم افقی فرم در ارتفاع انتخابی</summary>
      <p className="hint">
        برش روی فرم بستهٔ فعلی و محور Y بر حسب میلی‌متر؛ مختصات قطعات حفظ می‌شود. سطح برش تخت و بسته
        است؛ قفل اتصال، لقی یا جبران انقباض اضافه نمی‌شود.
      </p>
      {Number.isFinite(low) && low <= high && (
        <>
          <p>
            بازهٔ ارتفاع مجاز: {new Intl.NumberFormat('fa-IR').format(low)} تا{' '}
            {new Intl.NumberFormat('fa-IR').format(high)} میلی‌متر
          </p>
          <NumericControl
            label="ارتفاع برش افقی"
            value={height}
            onChange={setHeight}
            min={low}
            max={high}
            onBeginEdit={() => {}}
            onEndEdit={() => {}}
          />
        </>
      )}
      <button
        type="button"
        className="btn"
        disabled={!valid || busy}
        onClick={() => {
          void build();
        }}
      >
        {busy ? 'در حال تقسیم افقی…' : 'ساخت دو قطعهٔ برش افقی'}
      </button>
      {result && (
        <div role="status">
          دو قطعه بسته و اعتبارسنجی شدند.
          <button type="button" className="btn" onClick={() => download('lower')}>
            دانلود STL قطعهٔ پایین
          </button>
          <button type="button" className="btn" onClick={() => download('upper')}>
            دانلود STL قطعهٔ بالا
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <p className="hint">
        با تغییر فرم یا ارتفاع، نتیجهٔ قبلی کنار گذاشته می‌شود. تنظیمات و قطعات این ابزار موقتی‌اند و
        در پروژه یا ZIP قالب نیستند؛ اتصال و چاپ واقعی آزمایش نشده است.
      </p>
    </details>
  );
}
