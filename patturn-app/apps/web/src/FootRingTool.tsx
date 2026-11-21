import { useEffect, useMemo, useRef, useState } from 'react';
import { buildFootRing, type FootRingOptions, type Mesh } from '@patturn/kernel';
import { initCsg, unionFootRing } from '@patturn/molds';
import { toBinaryStl, exportName } from '@patturn/exporters';
import { NumericControl } from './NumericControl';

export function FootRingTool({
  mesh,
  onExport,
}: {
  mesh: Mesh | null;
  onExport: (name: string, bytes: Uint8Array) => void;
}) {
  const [width, setWidth] = useState(6),
    [depth, setDepth] = useState(4),
    [edge, setEdge] = useState<FootRingOptions['edge']>('square');
  const [result, setResult] = useState<Mesh | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const token = useRef(0);
  useEffect(() => {
    token.current++;
    setResult(null);
    setBusy(false);
    setError('');
    return () => {
      token.current++;
    };
  }, [mesh, width, depth, edge]);
  const ring = useMemo(() => {
    if (!mesh) return null;
    let floor = Infinity,
      radius = 0;
    for (let i = 1; i < mesh.positions.length; i += 3) floor = Math.min(floor, mesh.positions[i]!);
    for (let i = 0; i < mesh.positions.length; i += 3)
      if (Math.abs(mesh.positions[i + 1]! - floor) < 1e-5)
        radius = Math.max(radius, Math.hypot(mesh.positions[i]!, mesh.positions[i + 2]!));
    try {
      return buildFootRing({ outerRadius: radius * 0.85, width, depth, floorY: floor, edge });
    } catch {
      return null;
    }
  }, [mesh, width, depth, edge]);
  const build = async () => {
    if (!mesh || !ring || busy) return;
    const request = ++token.current;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      await initCsg();
      if (request !== token.current) return;
      const united = unionFootRing(mesh, ring);
      if (request === token.current) setResult(united);
    } catch {
      if (request === token.current)
        setError(
          'اتصال فوت‌رینگ ناموفق بود؛ فرم اصلی تغییر نکرد. پایه باید بسته، تخت و حول محور Y باشد.',
        );
    } finally {
      if (request === token.current) setBusy(false);
    }
  };
  return (
    <details className="foot-ring-tool">
      <summary>فوت‌رینگ — اتصال حلقهٔ پایه به فرم</summary>
      <p className="hint">
        حلقه در ۸۵٪ شعاع پایهٔ تختِ فرم و با هم‌پوشانی ۰٫۵ میلی‌متر متصل می‌شود. فقط برای فرم بسته و
        محورمتقارنِ فعلی؛ واحد ابعاد میلی‌متر است.
      </p>
      <NumericControl
        label="عرض فوت‌رینگ"
        value={width}
        onChange={setWidth}
        min={2}
        max={12}
        onBeginEdit={() => {}}
        onEndEdit={() => {}}
      />
      <NumericControl
        label="عمق فوت‌رینگ"
        value={depth}
        onChange={setDepth}
        min={2}
        max={15}
        onBeginEdit={() => {}}
        onEndEdit={() => {}}
      />
      <label>
        سبک لبهٔ فوت‌رینگ
        <select
          aria-label="سبک لبهٔ فوت‌رینگ"
          value={edge}
          onChange={(event) => setEdge(event.currentTarget.value as FootRingOptions['edge'])}
        >
          <option value="square">صاف</option>
          <option value="chamfer">پخ</option>
          <option value="round">گرد</option>
        </select>
      </label>
      {!ring && <p role="alert">ابعاد حلقه برای پایهٔ فعلی معتبر نیست؛ عرض را کمتر کنید.</p>}
      <button
        type="button"
        className="btn"
        disabled={!ring || busy}
        onClick={() => {
          void build();
        }}
      >
        {busy ? 'در حال اتصال فوت‌رینگ…' : 'ساخت فرم فوت‌رینگ‌دار'}
      </button>
      {result && (
        <div role="status">
          فوت‌رینگ با بدنه union و مش اعتبارسنجی شد.
          <button
            type="button"
            className="btn"
            onClick={() => {
              const output = toBinaryStl(result, 'form-foot-ring');
              if (!output.ok || !output.bytes) {
                setError('اعتبارسنجی STL فوت‌رینگ ناموفق بود.');
                return;
              }
              onExport(
                exportName('form', 'foot-ring', `W${width}-D${depth}-${edge}mm`, 'stl'),
                output.bytes,
              );
            }}
          >
            دانلود STL فرم فوت‌رینگ‌دار
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <p className="hint">
        این خروجی جدا و موقتی است؛ فرم اصلی، ظرفیت، قالب، تاریخچه، فایل پروژه و ZIP تغییر نمی‌کنند.
        تغییر پارامتر نتیجهٔ قبلی را حذف می‌کند. اتصال و تماس پایه، تعادل، چاپ و پخت واقعی آزمایش
        نشده‌اند؛ گردی با تقریب چندضلعی است.
      </p>
    </details>
  );
}
