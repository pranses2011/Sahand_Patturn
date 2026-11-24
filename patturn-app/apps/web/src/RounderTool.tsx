import { useMemo, useState } from 'react';
import { buildRounder, rounderDimensions, validateMesh } from '@patturn/kernel';
import { toBinaryStl, exportName } from '@patturn/exporters';
import { NumericControl } from './NumericControl';

export function RounderTool({ onExport }: { onExport: (name: string, bytes: Uint8Array) => void }) {
  const [diameter, setDiameter] = useState(80),
    [height, setHeight] = useState(40);
  const [error, setError] = useState('');
  const geometry = useMemo(() => {
    try {
      const options = { mouthDiameter: diameter, height };
      const mesh = buildRounder(options);
      return { mesh, report: validateMesh(mesh), ...rounderDimensions(options) };
    } catch {
      return null;
    }
  }, [diameter, height]);
  const format = (n: number) =>
    new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(n);
  return (
    <>
      <p className="hint">
        پلاگ توپر برای گردکردن دهانه؛ قطر اسمی در نیمهٔ ارتفاع است و سر بالایی باریک‌تر است. واحد
        ابعاد میلی‌متر است.
      </p>
      <NumericControl
        label="قطر اسمی دهانهٔ رینگ‌روندر"
        value={diameter}
        onChange={(n) => {
          setDiameter(n);
          setError('');
        }}
        min={20}
        max={160}
        onBeginEdit={() => {}}
        onEndEdit={() => {}}
      />
      <NumericControl
        label="ارتفاع رینگ‌روندر"
        value={height}
        onChange={(n) => {
          setHeight(n);
          setError('');
        }}
        min={10}
        max={100}
        onBeginEdit={() => {}}
        onEndEdit={() => {}}
      />
      {geometry && (
        <>
          <svg
            viewBox="-90 -110 180 125"
            role="img"
            aria-label="مقطع شماتیک رینگ‌روندر با خط قطر اسمی در نیمهٔ ارتفاع"
          >
            <path
              d={`M${-geometry.baseRadius} 0 L${-geometry.tipRadius} ${-height} H${geometry.tipRadius} L${geometry.baseRadius} 0 Z`}
              fill="#3f6c7a"
            />
            <path
              d={`M${-diameter / 2} ${-height / 2} H${diameter / 2}`}
              stroke="#fff"
              strokeWidth="1"
              strokeDasharray="3 2"
            />
          </svg>
          <p>
            قطر پایه: {format(geometry.baseRadius * 2)}؛ قطر سر: {format(geometry.tipRadius * 2)}{' '}
            میلی‌متر؛ شیب: ۳ درجه
          </p>
        </>
      )}
      <p role="status">
        {geometry?.report.ok
          ? 'مش رینگ‌روندر بسته و اعتبارسنجی‌شده است.'
          : 'هندسه نامعتبر است؛ خروجی مسدود شد.'}
      </p>
      <p className="hint">
        قطر مستقل از فرم پروژه و بدون جبران انقباض یا لقی است. تنظیمات موقتی‌اند و در فایل پروژه یا
        ZIP قالب نیستند. نمای مقطع و اعتبار هندسی جایگزین آزمون گل، گیرکردن، تحمل نیرو، ایمنی یا چاپ
        واقعی نیستند.
      </p>
      <button
        type="button"
        className="btn"
        disabled={!geometry?.report.ok}
        onClick={() => {
          if (!geometry?.report.ok) return;
          const result = toBinaryStl(geometry.mesh, 'rounder-taper-3deg');
          if (!result.ok || !result.bytes) {
            setError('اعتبارسنجی STL رینگ‌روندر ناموفق بود؛ فایلی تحویل نشد.');
            return;
          }
          onExport(
            exportName('rounder', 'taper3deg', `D${diameter}-H${height}mm`, 'stl'),
            result.bytes,
          );
        }}
      >
        دانلود STL رینگ‌روندر
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
