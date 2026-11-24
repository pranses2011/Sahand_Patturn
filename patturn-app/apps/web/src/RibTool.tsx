import { useEffect, useMemo, useRef, useState } from 'react';
import { buildRibMesh, type Profile } from '@patturn/kernel';
import { buildRib } from '@patturn/patterns';
import { toSvg, toDxf, toBinaryStl, toRibPdf, exportName } from '@patturn/exporters';
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
  const [thickness, setThickness] = useState(4);
  const [error, setError] = useState('');
  const drawing = useMemo(() => {
    try {
      return buildRib(profile, backing);
    } catch {
      return null;
    }
  }, [profile, backing]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const pdfRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    setPdfBusy(false);
    return () => {
      pdfRequest.current?.abort();
      pdfRequest.current = null;
    };
  }, [drawing, thickness]);
  async function downloadPdf() {
    if (!drawing || pdfRequest.current) return;
    const controller = new AbortController();
    pdfRequest.current = controller;
    setPdfBusy(true);
    setError('');
    try {
      const result = await toRibPdf(drawing.contact, thickness, controller.signal);
      if (pdfRequest.current !== controller) return;
      if (controller.signal.aborted) setError('ساخت PDF ریب لغو شد؛ فایلی تحویل نشد.');
      else if (!result.ok || !result.bytes)
        setError('PDF ریب ساخته نشد؛ هندسه و بارگذاری محلی خروجی را بررسی کنید.');
      else onExport(result.filename, result.bytes);
    } catch {
      if (pdfRequest.current === controller) setError('ساخت PDF ریب ناموفق بود؛ دوباره تلاش کنید.');
    } finally {
      if (pdfRequest.current === controller) {
        pdfRequest.current = null;
        setPdfBusy(false);
      }
    }
  }
  function downloadStl() {
    if (!drawing) return;
    try {
      const result = toBinaryStl(buildRibMesh(drawing.contact, thickness), 'rib');
      if (!result.ok || !result.bytes) throw new Error('RIB_MESH_INVALID');
      setError('');
      onExport(exportName('rib', 'solid', `back${backing}-T${thickness}mm`, 'stl'), result.bytes);
    } catch {
      setError(
        'مش ریب معتبر ساخته نشد؛ فاصلهٔ ارتفاع نقاط باید دست‌کم ۰٫۰۰۱mm باشد. فایلی تحویل نشد.',
      );
    }
  }
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
      <NumericControl
        label="ضخامت ریب"
        value={thickness}
        onChange={(n) => {
          setThickness(n);
          setError('');
        }}
        min={1}
        max={12}
        step={0.5}
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
          <svg
            role="img"
            aria-label="نمای ضخامت ریب"
            viewBox={`-1 -1 ${thickness + 2} ${drawing.height + 2}`}
            style={{ width: '100%', maxHeight: 100 }}
          >
            <rect
              width={thickness}
              height={drawing.height}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.2}
            />
          </svg>
          <button
            type="button"
            className="btn"
            disabled={pdfBusy}
            onClick={() => void downloadPdf()}
          >
            دانلود PDF ریب
          </button>
          {pdfBusy && (
            <button type="button" className="btn" onClick={() => pdfRequest.current?.abort()}>
              لغو PDF ریب
            </button>
          )}
          <button type="button" className="btn" onClick={downloadStl}>
            دانلود STL ریب
          </button>
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
        ریب با ضخامت یکنواخت و موقت، خارج از پروژه/ZIP است. PDF با مقیاس ۱:۱ و خط‌کش کنترل است؛ چاپ
        را پیش از برش اندازه بگیرید. تغییر فرم یا دیواره، پیش‌نمایش را به‌روز می‌کند.
      </p>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
