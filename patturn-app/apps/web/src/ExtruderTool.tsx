import { useEffect, useMemo, useRef, useState } from 'react';
import { initCsg, buildExtruderDie } from '@patturn/molds';
import { extruderDrawing, toBinaryStl, toSvg, toDxf, exportName } from '@patturn/exporters';
import { NumericControl } from './NumericControl';
import { formatNumber } from './number-format';
import { dxfErrorMessage } from './export-error';

export function ExtruderTool({
  onExport,
}: {
  onExport: (name: string, bytes: Uint8Array) => void;
}) {
  const [diameter, setDiameter] = useState(60),
    [thickness, setThickness] = useState(8),
    [holeDiameter, setHoleDiameter] = useState(8),
    [count, setCount] = useState(6),
    [orbit, setOrbit] = useState(16);
  const [flangeEnabled, setFlangeEnabled] = useState(false);
  const [flangeWidth, setFlangeWidth] = useState(5);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const token = useRef(0);
  const options = useMemo(
    () => ({
      diameterMm: diameter,
      thicknessMm: thickness,
      holeDiameterMm: holeDiameter,
      count,
      orbitRadiusMm: orbit,
      flangeWidthMm: flangeEnabled ? flangeWidth : 0,
    }),
    [diameter, thickness, holeDiameter, count, orbit, flangeEnabled, flangeWidth],
  );
  const drawing = useMemo(() => {
    try {
      return extruderDrawing(options);
    } catch {
      return null;
    }
  }, [options]);
  useEffect(() => {
    token.current++;
    setError('');
    setBusy(false);
    return () => {
      token.current++;
    };
  }, [options]);
  const filename = (format: string) =>
    exportName(
      'extruder',
      'round-holes',
      `D${diameter}-T${thickness}-H${holeDiameter}-N${count}-R${count === 1 ? 0 : orbit}${format === 'stl' && flangeEnabled ? `-F${flangeWidth}x4` : ''}mm`,
      format,
    );
  async function stl() {
    if (!drawing || busy) return;
    const request = ++token.current;
    setBusy(true);
    setError('');
    try {
      await initCsg();
      if (request !== token.current) return;
      const output = toBinaryStl(buildExtruderDie(options), 'extruder');
      if (!output.ok || !output.bytes) throw Error('EXTRUDER_INVALID_STL');
      onExport(filename('stl'), output.bytes);
    } catch {
      if (request === token.current)
        setError('STL دای ساخته نشد؛ هندسه و بارگذاری محلی WASM را بررسی و دوباره تلاش کنید.');
    } finally {
      if (request === token.current) setBusy(false);
    }
  }
  function drawingFile(format: 'svg' | 'dxf') {
    if (!drawing) return;
    const output =
      format === 'svg'
        ? toSvg(drawing.paths, drawing.width, drawing.height, { strokeMm: 0.2 })
        : toDxf(drawing.paths);
    if (!output.ok || !output.bytes) {
      setError(format === 'dxf' ? dxfErrorMessage(output.error) : 'خروجی SVG دای ساخته نشد.');
      return;
    }
    setError('');
    onExport(filename(format), output.bytes);
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
      step={1}
      unit="mm"
      onBeginEdit={() => {}}
      onEndEdit={() => {}}
    />
  );
  return (
    <>
      <p className="hint">
        دای آزمایشی با قطر دستی و سوراخ گرد؛ بدون جبران انقباض، اتصال تأییدشدهٔ دستگاه یا تأیید تحمل
        فشار. قطر را با دستگاه واقعی اندازه بگیرید؛ این الگو برای برند مشخصی تأیید نشده است.
      </p>
      {control('قطر بیرونی دای', diameter, setDiameter, 30, 150)}
      {control('ضخامت صفحهٔ دای', thickness, setThickness, 3, 20)}
      {control('قطر سوراخ دای', holeDiameter, setHoleDiameter, 2, 40)}
      <NumericControl
        label="تعداد سوراخ دای"
        value={count}
        onChange={setCount}
        min={1}
        max={12}
        step={1}
        unit="سوراخ"
        onBeginEdit={() => {}}
        onEndEdit={() => {}}
      />
      {count > 1 && control('شعاع آرایش سوراخ‌های دای', orbit, setOrbit, 0, 60)}
      <label>
        <input
          type="checkbox"
          checked={flangeEnabled}
          onChange={(event) => setFlangeEnabled(event.currentTarget.checked)}
        />
        فلنج نگه‌دارندهٔ اختیاری STL
      </label>
      {flangeEnabled && (
        <>
          {control('عرض شعاعی فلنج دای', flangeWidth, setFlangeWidth, 3, 12)}
          <p>
            ارتفاع فلنج ۴mm؛ ارتفاع کل STL: {formatNumber(thickness + 4)} mm. فلنج و شانه در SVG/DXF
            صادر نمی‌شوند؛ آن فایل‌ها فقط نقشهٔ صفحهٔ اصلی‌اند.
          </p>
        </>
      )}
      {drawing ? (
        <>
          <p>
            حد پایین محافظه‌کارانهٔ فاصلهٔ هندسی: {formatNumber(drawing.minWebMm, 3)} mm؛ حداقل مجاز
            ۱٫۵mm.
          </p>
          <svg
            role="img"
            aria-label="پیش‌نمایش دای اکسترودر"
            viewBox={`${-1 - (flangeEnabled ? flangeWidth : 0)} ${-1 - (flangeEnabled ? flangeWidth : 0)} ${drawing.width + 2 + 2 * (flangeEnabled ? flangeWidth : 0)} ${drawing.height + 2 + 2 * (flangeEnabled ? flangeWidth : 0)}`}
            style={{ width: '100%', maxHeight: 260 }}
          >
            {flangeEnabled && (
              <circle
                aria-label="مرز نمایشی فلنج، نه خط برش"
                cx={diameter / 2}
                cy={diameter / 2}
                r={diameter / 2 + flangeWidth}
                fill="none"
                stroke="currentColor"
                strokeWidth={0.2}
                strokeDasharray="2 2"
              />
            )}
            {drawing.paths.map((path, i) => (
              <path key={i} d={path.d} fill="none" stroke="currentColor" strokeWidth={0.2} />
            ))}
          </svg>
          <button type="button" className="btn" onClick={() => drawingFile('svg')}>
            دانلود SVG دای
          </button>
          <button type="button" className="btn" onClick={() => drawingFile('dxf')}>
            دانلود DXF دای
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => void stl()}>
            {busy ? 'در حال ساخت STL دای…' : 'دانلود STL دای'}
          </button>
        </>
      ) : (
        <p role="alert">
          ابعاد یا آرایش دای معتبر نیست؛ فاصلهٔ بین سوراخ‌ها و لبه باید دست‌کم ۱٫۵mm باشد. قطر سوراخ
          یا شعاع آرایش را اصلاح کنید.
        </p>
      )}
      <p className="hint">
        مرزها چندضلعیِ تقریب دایره‌اند؛ خط خروجی مرکز مسیر برش است و جبران ضخامت برش ندارد. فاصلهٔ
        هندسی، تضمین استحکام و ایمنی اکسترودر نیست. ابزار موقت و خارج از پروژه/ZIP است؛ طرح برش آزاد
        و قطرهای برندها هنوز پشتیبانی نمی‌شوند. فلنج STL حلقهٔ نگه‌دارندهٔ ساده است، نه اتصال پیچی یا
        fit تأییدشده؛ سوراخ‌ها در تمام ارتفاع باز می‌مانند.
      </p>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
