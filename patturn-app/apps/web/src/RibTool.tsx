import { useMemo, useState } from 'react';
import type { Profile } from '@patturn/kernel';
import { buildRib } from '@patturn/patterns';
import { toSvg, toDxf, exportName } from '@patturn/exporters';
import { NumericControl } from './NumericControl';
import { dxfErrorMessage } from './export-error';
import { formatNumber } from './number-format';

export function RibTool({
  profile,
  onExport,
}: {
  profile: Profile;
  onExport: (name: string, bytes: Uint8Array) => void;
}) {
  const [backing, setBacking] = useState(20);
  const [error, setError] = useState('');
  const drawing = useMemo(() => {
    try {
      return buildRib(profile, backing);
    } catch {
      return null;
    }
  }, [profile, backing]);
  function download(format: 'svg' | 'dxf') {
    if (!drawing) return;
    const result =
      format === 'svg'
        ? toSvg(drawing.paths, drawing.width, drawing.height, { strokeMm: 0.2 })
        : toDxf(drawing.paths, { width: drawing.width, height: drawing.height });
    if (!result.ok || !result.bytes) {
      setError(format === 'dxf' ? dxfErrorMessage(result.error) : 'خروجی SVG ریب ساخته نشد.');
      return;
    }
    setError('');
    onExport(exportName('rib', 'sampled-profile', `back${backing}mm`, format), result.bytes);
  }
  return (
    <>
      <p className="hint">
        لبهٔ تماس از نمونه‌های پروفیل داخلی فرم فعلی و ضخامت دیواره گرفته می‌شود؛ عرض پشت، فاصلهٔ افقی
        است، نه آفست عمود بر منحنی. بدون جبران انقباض، لقی، گردکردن لبه یا تضمین ساخت فیزیکی.
      </p>
      <NumericControl
        label="عرض پشت ریب"
        value={backing}
        onChange={(n) => {
          setBacking(n);
          setError('');
        }}
        min={5}
        max={80}
        unit="mm"
        onBeginEdit={() => {}}
        onEndEdit={() => {}}
      />
      {drawing ? (
        <>
          <p>
            ابعاد الگوی ریب: {formatNumber(drawing.width, 2)} × {formatNumber(drawing.height, 2)} mm
          </p>
          <svg
            role="img"
            aria-label="پیش‌نمایش ریب پروفیل"
            viewBox={`-1 -1 ${drawing.width + 2} ${drawing.height + 2}`}
            style={{ width: '100%', maxHeight: 260 }}
          >
            <path d={drawing.paths[0]!.d} fill="none" stroke="currentColor" strokeWidth={0.2} />
          </svg>
          <button type="button" className="btn" onClick={() => download('svg')}>
            دانلود SVG ریب
          </button>
          <button type="button" className="btn" onClick={() => download('dxf')}>
            دانلود DXF ریب
          </button>
        </>
      ) : (
        <p role="alert">پروفیل ریب معتبر نیست؛ ارتفاع باید صعودی و ابعاد در محدودهٔ مجاز باشد.</p>
      )}
      <p className="hint">
        الگوی دوبعدی موقت و خارج از پروژه/ZIP است؛ خروجی STL و PDF و ریب سه‌بعدی هنوز پشتیبانی
        نمی‌شود. تغییر فرم یا دیواره، پیش‌نمایش را به‌روز می‌کند.
      </p>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
