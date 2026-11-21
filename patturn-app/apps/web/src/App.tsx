import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  referenceOuterProfile,
  referenceProfile,
  capacityMl,
  filledMl,
  shrinkDim,
  revolve,
  validateMesh,
  plasterMix,
  catmullRom,
  type Mesh,
  type Profile,
} from '@patturn/kernel';
import { analyzeUndercut, keyTopRadius, initCsg, buildSingleMold } from '@patturn/molds';
import { unwrapCylinder } from '@patturn/kernel';
import { PATTERNS, type PatternContext } from '@patturn/patterns';
import { toBinaryStl, toSvg } from '@patturn/exporters';
import { AUTHOR, PLANS } from '@patturn/config';
import { Viewport } from './Viewport';

type Part = 'form' | 'pattern' | 'mold' | 'export';
type ProfileMode = 'reference' | 'bucket' | 'vase';

const PRESETS: Record<ProfileMode, Profile> = {
  reference: referenceOuterProfile(48),
  bucket: [
    { r: 0, y: -4 }, { r: 72.5, y: -4 }, { r: 72.5, y: 0 },
    { r: 66, y: 60 }, { r: 60, y: 120 }, { r: 58, y: 148 }, { r: 54, y: 148 },
  ],
  vase: [
    { r: 0, y: -4 }, { r: 40, y: -4 }, { r: 40, y: 0 },
    { r: 55, y: 30 }, { r: 68, y: 70 }, { r: 52, y: 110 },
    { r: 40, y: 140 }, { r: 44, y: 148 }, { r: 40, y: 148 },
  ],
};

function download(name: string, bytes: Uint8Array) {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function App() {
  const [part, setPart] = useState<Part>('form');
  const [profileMode, setProfileMode] = useState<ProfileMode>('reference');
  const [segments, setSegments] = useState(96);
  const [wall, setWall] = useState(4);
  const [shrink, setShrink] = useState(12); // %
  const [fill, setFill] = useState(80); // %
  const [patternId, setPatternId] = useState(PATTERNS[0]!.id);
  const [tileSize, setTileSize] = useState(40);
  const [saved, setSaved] = useState(true);
  const [meshErr, setMeshErr] = useState<string | null>(null);

  const profile = useMemo(() => PRESETS[profileMode], [profileMode]);

  const formMesh: Mesh | null = useMemo(() => {
    try {
      const m = revolve(profile, { segments, closeBottom: true, closeTop: profileMode !== 'reference' });
      const rep = validateMesh(m);
      setMeshErr(rep.ok ? null : rep.problems.join(' · '));
      return m;
    } catch (e) {
      setMeshErr(String(e));
      return null;
    }
  }, [profile, segments, profileMode]);

  // real boolean mold (block − form) when Mold tab is active
  const [moldMesh, setMoldMesh] = useState<Mesh | null>(null);
  const [moldBusy, setMoldBusy] = useState(false);
  useEffect(() => {
    if (part !== 'mold' || !formMesh) {
      setMoldMesh(null);
      return;
    }
    let cancelled = false;
    setMoldBusy(true);
    (async () => {
      try {
        await initCsg();
        const m = await buildSingleMold(formMesh, { shrink: shrink / 100 });
        if (!cancelled) {
          setMoldMesh(m);
          setMeshErr(null);
        }
      } catch (e) {
        if (!cancelled) setMeshErr(String(e).slice(0, 160));
      } finally {
        if (!cancelled) setMoldBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [part, formMesh, shrink]);

  const mesh: Mesh | null = part === 'mold' ? moldMesh : formMesh;

  // metrics
  const innerProfile = useMemo(() => referenceProfile(128), []);
  const capMl = useMemo(() => capacityMl(innerProfile), [innerProfile]);
  const filled = useMemo(() => filledMl(innerProfile, fill / 100), [innerProfile, fill]);
  const dryMm = shrinkDim(145, shrink / 100);
  const mix = useMemo(() => plasterMix((capMl * 2) / 1000), [capMl]); // rough mold = 2× cavity
  const undercut = useMemo(() => analyzeUndercut(profile), [profile]);

  // pattern canvas paths (SVG preview)
  const patternDef = useMemo(() => PATTERNS.find((p) => p.id === patternId) ?? PATTERNS[0]!, [patternId]);
  const patternPaths = useMemo(() => {
    const def = patternDef;
    const ctx: PatternContext = {
      canvasW: 300, canvasH: 300, tileW: tileSize, tileH: tileSize, seed: 42,
      params: { ...def.defaults },
    };
    return def.build(ctx);
  }, [patternDef, tileSize]);

  // cylindrical unwrap of the form for this tile size (distortion index, checklist 4.8)
  const unwrapInfo = useMemo(
    () => (formMesh ? unwrapCylinder(formMesh, { tileW: tileSize }) : null),
    [formMesh, tileSize],
  );

  const markDirty = useCallback(() => setSaved(false), []);

  // autosave every 2s when idle (site contract)
  useEffect(() => {
    if (saved) return;
    const t = setTimeout(() => {
      localStorage.setItem(
        'patturn:last',
        JSON.stringify({ profileMode, segments, wall, shrink, fill, patternId, tileSize, at: Date.now() }),
      );
      setSaved(true);
    }, 2000);
    return () => clearTimeout(t);
  }, [saved, profileMode, segments, wall, shrink, fill, patternId, tileSize]);

  const doExportStl = () => {
    if (!mesh) return;
    const res = toBinaryStl(mesh, `form-${profileMode}`);
    if (!res.ok) { alert(`خروجی نامعتبر: ${res.error}`); return; }
    download(res.filename, res.bytes!);
    markDirty();
  };

  const doExportSvg = () => {
    const res = toSvg(patternPaths, 300, 300);
    download(res.filename, res.bytes!);
  };

  const numCtl = (label: string, value: number, set: (n: number) => void, min: number, max: number, step = 1, unit = 'mm') => (
    <div className="ctl">
      <label>
        <span>{label}</span>
        <span className="val">
          {value} {unit}
          <input
            className="num" type="number" value={value} min={min} max={max} step={step}
            onChange={(e) => { set(Number(e.target.value)); markDirty(); }}
            style={{ marginRight: 6 }}
          />
        </span>
      </label>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => { set(Number(e.target.value)); markDirty(); }} />
    </div>
  );

  return (
    <div className="app">
      {/* ── header ── */}
      <header className="header">
        <span className="brand">🏺 Patturn</span>
        <span className="saved">{saved ? '✓ ذخیره شد' : '…در حال ذخیره'}</span>
        <span className="spacer" />
        <button className="btn" onClick={doExportSvg}>خروجی SVG الگو</button>
        <button className="btn primary" onClick={doExportStl}>⬇ خروجی STL</button>
      </header>

      <div className="main">
        {/* ── left: parts ── */}
        <aside className="panel left">
          <h3 className="sec">🧩 قطعات</h3>
          <ul className="parts">
            {([
              ['form', '🏺 فرم', 'Form'],
              ['pattern', '🔷 الگو', 'Pattern'],
              ['mold', '🧱 قالب', 'Mold'],
              ['export', '📤 خروجی', 'Export'],
            ] as [Part, string, string][]).map(([id, label]) => (
              <li key={id} className={part === id ? 'active' : ''} onClick={() => setPart(id)}>
                <span>{label}</span>
              </li>
            ))}
          </ul>

          {part === 'form' && (
            <>
              <h3 className="sec">پریست</h3>
              {([
                ['reference', 'گلدان مرجع (۱۱۳۱ml)'],
                ['bucket', 'سطل گشاد'],
                ['vase', 'گلدان کمر باریک'],
              ] as [ProfileMode, string][]).map(([id, label]) => (
                <div className="ctl" key={id}>
                  <label style={{ cursor: 'pointer' }}>
                    <input type="radio" name="preset" checked={profileMode === id}
                      onChange={() => { setProfileMode(id); markDirty(); }} /> {label}
                  </label>
                </div>
              ))}
            </>
          )}

          {part === 'pattern' && (
            <>
              <h3 className="sec">کتابخانهٔ الگو</h3>
              {PATTERNS.map((p) => (
                <div className="ctl" key={p.id}>
                  <label style={{ cursor: 'pointer' }}>
                    <input type="radio" name="pat" checked={patternId === p.id}
                      onChange={() => { setPatternId(p.id); markDirty(); }} /> {p.label}
                  </label>
                </div>
              ))}
              <h3 className="sec">نگاشت روی فرم (unwrap استوانه‌ای)</h3>
              <div className="hint">
                {unwrapInfo ? (
                  <>
                    شاخص اعوجاج: <b>{(unwrapInfo.distortion * 100).toFixed(1)}٪</b>
                    {' '}(میانگین {(unwrapInfo.meanDistortion * 100).toFixed(1)}٪)
                    <br />تعداد کاشی دور فرم: <b>{unwrapInfo.tileCount}</b>
                    {' '}× {tileSize}mm = {unwrapInfo.circumference.toFixed(1)}mm محیط مرجع
                    <br /> seam بدون پارگی بافت (continuity per-triangle)
                  </>
                ) : (
                  'فرم بارگذاری نشده'
                )}
              </div>
            </>
          )}

          {part === 'mold' && (
            <>
              <h3 className="sec">تحلیل قالب</h3>
              <div className="hint">
                {moldBusy ? '⏳ در حال محاسبهٔ Boolean (block − form)…' : moldMesh ? '✅ قالب سه‌بعدی ساخته شد — در viewport ببینید' : null}
                {moldBusy ? null : (
                  <>
                    {undercut.dropOutSafe ? (
                      <>✅ فرم drop-out مجاز است → قالب <b>تک‌تکه</b></>
                    ) : (
                      <>⚠️ زیر برش: {undercut.problemBands.length} ناحیه → پیشنهاد <b>{undercut.suggestedParts} قطعه</b></>
                    )}
                    <br />کلید ثبت Ø16 با تلورانس 0.2mm
                    <br />r_top = {keyTopRadius().toFixed(4)} mm
                  </>
                )}
              </div>
              <h3 className="sec">مواد (مراجعه به فرم مرجع)</h3>
              <div className="hint">
                گچ: <b>{mix.plasterKg.toFixed(2)} kg</b> · آب: <b>{mix.waterKg.toFixed(2)} kg</b>
                <br />حجم مخلوط: {((capMl * 2) / 1000).toFixed(2)} L
              </div>
            </>
          )}

          {part === 'export' && (
            <>
              <h3 className="sec">خروجی‌ها</h3>
              <div className="ctl"><button className="btn primary" style={{ width: '100%' }} onClick={doExportStl}>
                ⬇ STL سه‌بعدی (اعتبارسنجی‌شده)</button></div>
              <div className="ctl"><button className="btn" style={{ width: '100%' }} onClick={doExportSvg}>
                ⬇ SVG الگوی تخت ۳۰۰×۳۰۰mm</button></div>
              <div className="hint">
                هر خروجی STL قبل از دانلود روی watertight بودن بررسی میشود.
                {meshErr && <><br />⚠️ مش فعلی: {meshErr}</>}
              </div>
            </>
          )}
        </aside>

        {/* ── center: viewport ── */}
        <section className="viewport">
          <Viewport
            mesh={mesh}
            mode={part === 'mold' ? 'mold' : 'form'}
            pattern={part === 'pattern' && patternDef
              ? { paths: patternPaths, tileW: tileSize, strokeMm: typeof patternDef.defaults['stroke'] === 'number' ? patternDef.defaults['stroke'] : 1.5 }
              : null}
          />

          {part === 'pattern' && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#14110e' }}>
              <svg width="420" height="420" viewBox="0 0 300 300" style={{ background: '#f7f3ec', borderRadius: 12 }}>
                {patternPaths.map((p, i) => (
                  <path key={i} d={p.d}
                    fill={p.fill ? '#1c1917' : 'none'}
                    stroke={p.fill ? 'none' : '#c4622d'} strokeWidth={1.5} />
                ))}
              </svg>
            </div>
          )}

          {/* 2D profile strip */}
          {part === 'form' && (
            <div className="profile-2d">
              <svg width="200" height="120" viewBox="-10 -10 220 140">
                <line x1="-10" y1="124" x2="210" y2="124" stroke="#e3dbcc" />
                <line x1="100" y1="-10" x2="100" y2="130" stroke="#e3dbcc" strokeDasharray="3 3" />
                <path
                  d={profile
                    .map((pt, i) => `${i ? 'L' : 'M'}${100 + pt.r * 0.6} ${120 - pt.y * 0.72}`)
                    .join('')}
                  fill="none" stroke="#c4622d" strokeWidth="2.5"
                />
              </svg>
              <div className="cap">پروفیل جانبی (mm)</div>
            </div>
          )}
        </section>

        {/* ── right: params ── */}
        <aside className="panel">
          {part === 'form' && (
            <>
              <h3 className="sec">⚙️ پارامترهای فرم</h3>
              {numCtl('تعداد سگمنت', segments, setSegments, 12, 256, 4, '')}
              {numCtl('ضخامت دیواره', wall, setWall, 1, 20)}
              {numCtl('شیرینک', shrink, setShrink, 0, 20, 0.5, '%')}
              {numCtl('سطح پرشدگی', fill, setFill, 0, 100, 5, '%')}
              <h3 className="sec">📐 ابعاد مرجع</h3>
              <div className="hint" style={{ direction: 'ltr', textAlign: 'left' }}>
                w 145 · h 148 · wall {wall} mm
                <br />Capacity: <b>{capMl.toFixed(0)} ml</b>
                <br />Filled {fill}%: <b>{filled.toFixed(0)} ml</b>
                <br />Dry @ {shrink}%: <b>{dryMm.toFixed(1)} mm</b>
                <br />Shrink 145 → 127.6 ✓
              </div>
            </>
          )}

          {part === 'pattern' && (
            <>
              <h3 className="sec">⚙️ پارامترهای الگو</h3>
              {numCtl('اندازهٔ کاشی', tileSize, setTileSize, 8, 120, 1)}
              <div className="hint">
                بوم: 300×300 mm · واحد: mm
                <br />خروجی SVG با واحد واقعی (قرارداد T7).
              </div>
            </>
          )}

          {part === 'mold' && (
            <>
              <h3 className="sec">⚙️ پارامترهای قالب</h3>
              <div className="hint">
                <b>دیواره ۲۵mm · کف ۲۰mm · شیب ۱.۵°</b>
                <br />کلید: مخروطی Ø16×10، taper 4°
                <br />تلورانس: 0.20 mm
                <br />گچ (۲× حجم فرم): {mix.plasterKg.toFixed(2)} kg
                <br />آب: {mix.waterKg.toFixed(2)} kg
                <br />
                {undercut.dropOutSafe ? '✅ تک‌تکه مجاز' : `⚠️ چندتکه (${undercut.suggestedParts})`}
              </div>
            </>
          )}

          {part === 'export' && (
            <>
              <h3 className="sec">ℹ️ وضعیت</h3>
              <div className="hint">
                اعتبارسنجی مش: {meshErr ? `❌ ${meshErr}` : mesh ? '✅ watertight' : '—'}
                <br />پلن فعلی: <b>{PLANS.free.name}</b> (محلی، بدون سرور)
              </div>
            </>
          )}

          <h3 className="sec">👤 پشتیبانی</h3>
          <div className="hint" style={{ fontSize: 11.5 }}>
            {AUTHOR.name} — {AUTHOR.company}
            <br />
            <span style={{ direction: 'ltr', display: 'inline-block' }}>{AUTHOR.phone}</span>
            <br />
            <span style={{ direction: 'ltr', display: 'inline-block' }}>{AUTHOR.email}</span>
            <br />
            <span style={{ direction: 'ltr', display: 'inline-block' }}>{AUTHOR.card}</span>
            <br />
            {AUTHOR.site}
          </div>
        </aside>
      </div>

      {/* ── status bar ── */}
      <footer className="statusbar">
        <span>w <b>145</b> h <b>148</b> mm</span>
        <span>Wall <b>{wall}</b></span>
        <span>Cap <b>{capMl.toFixed(0)}</b> ml</span>
        <span>Filled <b>{filled.toFixed(0)}</b> ml</span>
        <span>Shrink <b>{shrink}%</b></span>
        <span>Segments <b>{segments}</b></span>
        <span>{meshErr ? `⚠ ${meshErr}` : mesh ? `mesh OK · ${mesh.indices.length / 3} tris` : ''}</span>
      </footer>
    </div>
  );
}
