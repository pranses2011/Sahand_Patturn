import { useMemo, useState } from 'react';
import { buildEllipseLoft, buildArcSweep } from '@patturn/kernel';
import { exportName, toBinaryStl } from '@patturn/exporters';
import { NumericControl } from './NumericControl';
export function LoftSweepTool({
  onExport,
}: {
  onExport: (name: string, bytes: Uint8Array) => void;
}) {
  const [mode, setMode] = useState<'loft' | 'sweep'>('loft');
  const [bx, setBx] = useState(30),
    [bz, setBz] = useState(20),
    [tx, setTx] = useState(50),
    [tz, setTz] = useState(35),
    [height, setHeight] = useState(100),
    [offset, setOffset] = useState(0);
  const [radius, setRadius] = useState(60),
    [tube, setTube] = useState(8),
    [angle, setAngle] = useState(180),
    [error, setError] = useState('');
  const mesh = useMemo(
    () =>
      mode === 'loft'
        ? buildEllipseLoft({
            bottomX: bx,
            bottomZ: bz,
            topX: tx,
            topZ: tz,
            height,
            offsetX: offset,
          })
        : buildArcSweep({ pathRadius: radius, tubeRadius: tube, angleDeg: angle }),
    [mode, bx, bz, tx, tz, height, offset, radius, tube, angle],
  );
  const control = (
    label: string,
    value: number,
    set: (n: number) => void,
    min: number,
    max: number,
    unit = 'mm',
  ) => (
    <NumericControl
      label={label}
      value={value}
      onChange={(n) => {
        set(n);
        setError('');
      }}
      min={min}
      max={max}
      unit={unit}
      onBeginEdit={() => {}}
      onEndEdit={() => {}}
    />
  );
  return (
    <details className="loft-sweep-tool">
      <summary>Loft / Sweep — دو مقطع بیضوی یا مسیر قوسی</summary>
      <p className="hint">
        ساخت جامد مستقل با دو درپوش؛ شعاع‌ها و طول‌ها برحسب میلی‌متر هستند. مقطع و مسیر دلخواه،
        اتصال به بدنه و جبران انقباض پشتیبانی نمی‌شوند.
      </p>
      <label>
        روش ساخت
        <select
          aria-label="روش ساخت Loft/Sweep"
          value={mode}
          onChange={(event) => {
            setMode(event.currentTarget.value as 'loft' | 'sweep');
            setError('');
          }}
        >
          <option value="loft">Loft دو بیضی</option>
          <option value="sweep">Sweep دایره روی قوس</option>
        </select>
      </label>
      {mode === 'loft' ? (
        <>
          {control('شعاع X مقطع پایین', bx, setBx, 5, 100)}
          {control('شعاع Z مقطع پایین', bz, setBz, 5, 100)}
          {control('شعاع X مقطع بالا', tx, setTx, 5, 100)}
          {control('شعاع Z مقطع بالا', tz, setTz, 5, 100)}
          {control('ارتفاع Loft', height, setHeight, 10, 300)}
          {control('جابجایی X مقطع بالا', offset, setOffset, -100, 100)}
        </>
      ) : (
        <>
          {control(
            'شعاع مسیر Sweep',
            radius,
            (n) => {
              setRadius(n);
              setTube((v) => Math.min(v, n / 2));
            },
            20,
            150,
          )}
          {control('شعاع مقطع Sweep', tube, setTube, 2, Math.min(30, radius / 2))}
          {control('زاویه مسیر Sweep', angle, setAngle, 15, 270, 'درجه')}
          <p className="hint">
            قاب کمینه‌چرخش مسیر صفحه‌ای با بینرمال ثابت؛ شعاع مقطع حداکثر نصف شعاع مسیر است تا سطح
            تا نخورد.
          </p>
        </>
      )}
      <svg
        role="img"
        aria-label="پیش‌نمایش خطی Loft/Sweep"
        viewBox="-170 -180 500 500"
        style={{ width: '100%', maxHeight: 260 }}
      >
        {Array.from({ length: mode === 'loft' ? 2 : 13 }, (_, i) => {
          const segment = mode === 'loft' ? 96 : 64,
            ring = mode === 'loft' ? i : i * 8;
          const points = Array.from({ length: segment + 1 }, (_, s) => {
            const index = (ring * segment + (s % segment)) * 3;
            return `${mesh.positions[index]},${-mesh.positions[index + 1]!}`;
          }).join(' ');
          return (
            <polyline key={i} points={points} fill="none" stroke="currentColor" strokeWidth={0.7} />
          );
        })}
      </svg>
      <p className="hint">
        نمای خطی تصویر X/Y است و عمق Z را نشان نمی‌دهد؛ جایگزین بررسی سه‌بعدی در CAD نیست. تنظیمات
        موقت‌اند و در پروژه/ZIP و تاریخچه ذخیره نمی‌شوند. چاپ و تحمل بار واقعی تأیید نشده‌اند.
      </p>
      <button
        type="button"
        className="btn"
        onClick={() => {
          const output = toBinaryStl(mesh, `tool-${mode}`);
          if (!output.ok || !output.bytes) {
            setError('اعتبارسنجی STL ناموفق بود.');
            return;
          }
          const params =
            mode === 'loft'
              ? `B${bx}x${bz}-T${tx}x${tz}-H${height}-X${offset}`
              : `R${radius}-r${tube}-A${angle}`;
          onExport(exportName('tool', mode, params, 'stl'), output.bytes);
        }}
      >
        دانلود STL {mode === 'loft' ? 'Loft' : 'Sweep'}
      </button>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
