import { useMemo, useState } from 'react';
import { buildSlab } from '@patturn/patterns';
import { exportName, toSvg, toDxf } from '@patturn/exporters';
import { NumericControl } from './NumericControl';
export function SlabTool({ onExport }: { onExport: (name: string, bytes: Uint8Array) => void }) {
  const [bottom, setBottom] = useState(40),
    [top, setTop] = useState(60),
    [height, setHeight] = useState(100),
    [guides, setGuides] = useState(8),
    [error, setError] = useState('');
  const drawing = useMemo(
    () => buildSlab({ bottomRadius: bottom, topRadius: top, height, guides }),
    [bottom, top, height, guides],
  );
  const control = (
    label: string,
    value: number,
    onChange: (n: number) => void,
    min: number,
    max: number,
    unit = 'mm',
  ) => (
    <NumericControl
      label={label}
      value={value}
      onChange={(n) => {
        onChange(n);
        setError('');
      }}
      min={min}
      max={max}
      unit={unit}
      onBeginEdit={() => {}}
      onEndEdit={() => {}}
    />
  );
  function download(format: 'svg' | 'dxf') {
    const out =
      format === 'svg'
        ? toSvg(drawing.paths, drawing.width, drawing.height, { strokeMm: 0.2 })
        : toDxf(drawing.paths, { width: drawing.width, height: drawing.height });
    if (!out.ok || !out.bytes) {
      setError('خروجی اسلب تولید نشد.');
      return;
    }
    onExport(
      exportName('slab', 'developed', `B${bottom}-T${top}-H${height}-G${guides}mm`, format),
      out.bytes,
    );
  }
  return (
    <>
      <p className="hint">
        سطح میانی مستقل، نه بازکردن فرم فعلی پروژه. شعاع برابر یعنی استوانه؛ شعاع متفاوت یعنی مخروط
        ناقص. خطوط داخلی راهنمای فرم‌دهی‌اند، نه مسیر برش یا خط تای تیز.
      </p>
      {control('شعاع پایین اسلب', bottom, setBottom, 10, 150)}
      {control('شعاع بالای اسلب', top, setTop, 10, 150)}
      {control('ارتفاع اسلب', height, setHeight, 10, 300)}
      {control('تعداد بخش‌های راهنمای اسلب', guides, setGuides, 2, 24, 'بخش')}
      <p>
        اعوجاج نظری سطح توسعه‌پذیر: ۰٪؛ تقریب قوس با خطا حداکثر ۰٫۰۲ میلی‌متر. بدون ضخامت، انقباض،
        لبهٔ اتصال یا تضمین نتیجهٔ فیزیکی.
      </p>
      <svg
        role="img"
        aria-label="پیش‌نمایش اسلب تخت"
        viewBox={`-1 -1 ${drawing.width + 2} ${drawing.height + 2}`}
        style={{ width: '100%', maxHeight: 260 }}
      >
        {drawing.paths.map((path, i) => (
          <path
            key={i}
            d={path.d}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.2}
            strokeDasharray={i ? '2 2' : undefined}
          />
        ))}
      </svg>
      <p className="hint">
        SVG/DXF شامل مرز بیرونی و همهٔ راهنماهاست؛ پیش از برش، راهنماها را در CAD جدا کنید. خط‌چین
        پیش‌نمایش صرفاً نمایشی است و خروجی خطوط ساده دارد. خروجی موقت و خارج از پروژه/ZIP است؛ فرم
        شکم‌دار یا اعوجاج فرم عمومی پشتیبانی نمی‌شود.
      </p>
      <button type="button" className="btn" onClick={() => download('svg')}>
        دانلود SVG اسلب
      </button>
      <button type="button" className="btn" onClick={() => download('dxf')}>
        دانلود DXF اسلب
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
