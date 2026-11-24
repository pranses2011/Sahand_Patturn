import { StampTool } from './StampTool';
import { useEffect, useMemo, useRef, useState } from 'react';
import { traceImage, detectIslands, bridgeIsland } from '@patturn/patterns';
import { exportName, toSvg, toDxf } from '@patturn/exporters';
import { NumericControl } from './NumericControl';
type Raster = { width: number; height: number; pixels: Uint8Array };
export function ImageTraceTool({
  onExport,
}: {
  onExport: (name: string, bytes: Uint8Array) => void;
}) {
  const [raster, setRaster] = useState<Raster | null>(null),
    [reference, setReference] = useState(100),
    [tolerance, setTolerance] = useState(0.2),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const token = useRef(0);
  useEffect(
    () => () => {
      token.current++;
    },
    [],
  );
  const sourceDrawing = useMemo(() => {
    if (!raster) return null;
    try {
      return traceImage({ ...raster, referenceWidthMm: reference, toleranceMm: tolerance });
    } catch {
      return null;
    }
  }, [raster, reference, tolerance]);
  const [bridged, setBridged] = useState<{
    base: typeof sourceDrawing;
    result: NonNullable<typeof sourceDrawing>;
  } | null>(null);
  const [bridgeWidth, setBridgeWidth] = useState(2),
    [selection, setSelection] = useState(0);
  const drawing = bridged?.base === sourceDrawing ? bridged.result : sourceDrawing;
  const islands = useMemo(() => {
    if (!drawing) return null;
    try {
      return { items: detectIslands(drawing.contours), error: '' };
    } catch {
      return {
        items: [],
        error:
          'تشخیص جزیره قطعی نیست: کانتورها متقاطع، مماس، نامعتبر یا بیش‌ازحد پیچیده‌اند (سقف ۴۰۹۶ رأس). تلرانس را کاهش دهید یا تصویر ساده‌تر انتخاب کنید.',
      };
    }
  }, [drawing]);
  async function load(file: File) {
    const request = ++token.current;
    setBusy(true);
    setError('');
    setRaster(null);
    let bitmap: ImageBitmap | null = null;
    try {
      if (
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
        file.size > 5 * 1024 * 1024
      )
        throw Error('FILE_LIMIT');
      bitmap = await createImageBitmap(file);
      if (bitmap.width > 4096 || bitmap.height > 4096 || bitmap.width < 2 || bitmap.height < 2)
        throw Error('DIMENSION_LIMIT');
      if (request !== token.current) return;
      const ratio = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(2, Math.round(bitmap.width * ratio)),
        height = Math.max(2, Math.round(bitmap.height * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw Error('NO_CANVAS');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      const rgba = context.getImageData(0, 0, width, height).data;
      const pixels = Uint8Array.from({ length: width * height }, (_, i) =>
        Math.round(0.2126 * rgba[i * 4]! + 0.7152 * rgba[i * 4 + 1]! + 0.0722 * rgba[i * 4 + 2]!),
      );
      setRaster({ width, height, pixels });
    } catch {
      if (request === token.current)
        setError('تصویر خوانده نشد؛ PNG/JPEG/WebP تا ۵ MiB و ابعاد ۲ تا ۴۰۹۶ پیکسل لازم است.');
    } finally {
      bitmap?.close();
      if (request === token.current) setBusy(false);
    }
  }
  function download(format: 'svg' | 'dxf') {
    if (!drawing?.paths.length) return;
    const output =
      format === 'svg'
        ? toSvg(drawing.paths, drawing.width, drawing.height, { strokeMm: 0.2 })
        : toDxf(drawing.paths, { width: drawing.width, height: drawing.height });
    if (!output.ok || !output.bytes) {
      setError('تولید فایل ردیابی ناموفق بود.');
      return;
    }
    onExport(
      exportName('trace', 'contours', `W${reference}-E${tolerance}mm`, format),
      output.bytes,
    );
  }
  return (
    <>
      <p className="hint">
        پردازش فقط روی دستگاه است؛ فایل به سرور ارسال نمی‌شود. تصویر به حداکثر ۲۵۶ پیکسل در هر بُعد
        کاهش می‌یابد؛ شفافیت روی سفید ترکیب می‌شود. عرض مرجع، عرض کل تصویر است، نه اندازهٔ یک نشان
        داخل آن.
      </p>
      <label>
        تصویر ردیابی
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void load(file);
            event.currentTarget.value = '';
          }}
        />
      </label>
      <NumericControl
        label="عرض مرجع تصویر"
        value={reference}
        onChange={setReference}
        min={10}
        max={500}
        onBeginEdit={() => {}}
        onEndEdit={() => {}}
      />
      <NumericControl
        label="خطای ساده‌سازی ردیابی"
        value={tolerance}
        onChange={setTolerance}
        min={0}
        max={2}
        step={0.05}
        onBeginEdit={() => {}}
        onEndEdit={() => {}}
      />
      {busy && <p role="status">در حال خواندن تصویر…</p>}
      {error && <p role="alert">{error}</p>}
      {raster && !drawing && (
        <p role="alert">
          کانتور بیش‌ازحد پیچیده است؛ تصویر ساده‌تر انتخاب کنید (حداکثر ۵۱۲ کانتور).
        </p>
      )}
      {drawing && (
        <>
          <p role="status">
            {new Intl.NumberFormat('fa-IR').format(drawing.paths.length)} کانتور؛ آستانهٔ Otsu:{' '}
            {new Intl.NumberFormat('fa-IR').format(drawing.threshold)}
          </p>
          {islands?.error && <p role="alert">{islands.error}</p>}
          {islands && !islands.error && (
            <p role="status">
              جزیرهٔ محصور نیازمند پل:{' '}
              {new Intl.NumberFormat('fa-IR').format(
                islands.items.filter((item) => item.isIsland).length,
              )}{' '}
              — نمایش با خط ضخیم نارنجی؛ با فرض برش نواحی تیره و قاعدهٔ زوج/فرد.
            </p>
          )}
          {islands && !islands.error && (
            <fieldset>
              <legend>پل نگهدارندهٔ جزیره</legend>
              <label>
                جزیرهٔ پل
                <select
                  aria-label="جزیرهٔ پل"
                  value={
                    islands.items.find((item) => item.isIsland && item.index === selection)
                      ?.index ??
                    islands.items.find((item) => item.isIsland)?.index ??
                    ''
                  }
                  onChange={(event) => setSelection(Number(event.currentTarget.value))}
                >
                  {islands.items
                    .filter((item) => item.isIsland)
                    .map((item) => (
                      <option key={item.index} value={item.index}>
                        جزیرهٔ {new Intl.NumberFormat('fa-IR').format(item.index + 1)}
                      </option>
                    ))}
                </select>
              </label>
              <NumericControl
                label="عرض پل جزیره"
                value={bridgeWidth}
                onChange={setBridgeWidth}
                min={0.5}
                max={10}
                step={0.5}
                onBeginEdit={() => {}}
                onEndEdit={() => {}}
              />
              <button
                type="button"
                className="btn"
                disabled={!islands.items.some((item) => item.isIsland)}
                onClick={() => {
                  const item =
                    islands.items.find((item) => item.isIsland && item.index === selection) ??
                    islands.items.find((item) => item.isIsland);
                  if (!item) return;
                  try {
                    const result = bridgeIsland(drawing.contours, item.index, bridgeWidth);
                    setBridged({ base: sourceDrawing, result: { ...drawing, ...result } });
                    setError('');
                  } catch {
                    setError('ساخت پل معتبر نشد؛ عرض یا تصویر را تغییر دهید. هندسهٔ قبلی حفظ شد.');
                  }
                }}
              >
                اعمال پل به کانتور برش
              </button>
              <button
                type="button"
                className="btn"
                disabled={!bridged || bridged.base !== sourceDrawing}
                onClick={() => {
                  setBridged(null);
                  setError('');
                }}
              >
                حذف همهٔ پل‌ها
              </button>
              <p className="hint">
                نوار با عرض انتخابی از ناحیهٔ برش کم می‌شود تا ماده باقی بماند؛ کوتاه‌ترین اتصال
                رأس/لبه به والد انتخاب می‌شود و دو سر نیم‌عرض امتداد دارند. می‌توانید برای هر جزیره
                جداگانه پل اعمال کنید. تغییر تصویر، مقیاس یا تلرانس همهٔ پل‌ها را بازنشانی می‌کند؛
                تغییر عرض فقط روی اعمال بعدی اثر دارد. تضمین استحکام یا حداقل عرض فیزیکی وجود ندارد.
              </p>
            </fieldset>
          )}
          <svg
            role="img"
            aria-label="پیش‌نمایش کانتور تصویر"
            viewBox={`-1 -1 ${drawing.width + 2} ${drawing.height + 2}`}
            style={{ width: '100%', maxHeight: 260 }}
          >
            {drawing.paths.map((path, i) => (
              <path
                key={i}
                d={path.d}
                fill="none"
                stroke={islands?.items[i]?.isIsland ? '#a94f21' : 'currentColor'}
                strokeWidth={islands?.items[i]?.isIsland ? 0.8 : 0.2}
                data-island={islands?.items[i]?.isIsland ? 'true' : 'false'}
              />
            ))}
          </svg>
          {!drawing.paths.length && <p>کنتراست یا کانتور قابل‌ردیابی پیدا نشد.</p>}
        </>
      )}
      <button
        type="button"
        className="btn"
        disabled={!drawing?.paths.length || busy}
        onClick={() => download('svg')}
      >
        دانلود SVG ردیابی
      </button>
      <button
        type="button"
        className="btn"
        disabled={!drawing?.paths.length || busy}
        onClick={() => download('dxf')}
      >
        دانلود DXF ردیابی
      </button>
      {drawing && <StampTool contours={drawing.contours} onExport={onExport} />}
      <p className="hint">
        لبهٔ ناحیهٔ تیره با marching squares و ساده‌سازی RDP؛ پیکسل‌های قطری جدا در نظر گرفته می‌شوند.
        مرز داخلی سوراخ‌ها نیز صادر می‌شود؛ تشخیص جزیره فقط برای کانتورهای ساده و جداست. پرشدگی، پل،
        kerf و عدم تقاطع کانتورهای ساده‌شده تضمین نمی‌شوند. پیش از ساخت در CAD بررسی کنید. داده و
        نتیجه موقت و خارج از پروژه/ZIP هستند.
      </p>
    </>
  );
}
