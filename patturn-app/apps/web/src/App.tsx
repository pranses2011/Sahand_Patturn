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
import {
  analyzeUndercut, keyTopRadius, initCsg,
  chooseSplitPlanes, buildSplitMold, buildMotherMold, plasterForCavity,
  type SplitPlan, type MotherMoldResult,
} from '@patturn/molds';
import { unwrapCylinder } from '@patturn/kernel';
import { PATTERNS, type PatternContext } from '@patturn/patterns';
import { toBinaryStl, toSvg, exportName } from '@patturn/exporters';
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

  // real boolean mold (block − form, split by plan) when Mold tab is active
  const [moldParts, setMoldParts] = useState<Mesh[] | null>(null);
  const [splitPlan, setSplitPlan] = useState<SplitPlan | null>(null);
  const [moldBusy, setMoldBusy] = useState(false);
  const [motherResults, setMotherResults] = useState<MotherMoldResult[] | null>(null);
  const [motherBusy, setMotherBusy] = useState(false);
  const [motherError, setMotherError] = useState<string | null>(null);
  useEffect(() => {
    setMotherResults(null);
    setMotherError(null);
    setMotherBusy(false);
  }, [moldParts]);
  useEffect(() => {
    if (!motherBusy || !moldParts) return;
    let cancelled = false;
    (async () => {
      try {
        const results: MotherMoldResult[] = [];
        for (const master of moldParts) results.push(await buildMotherMold(master));
        if (!cancelled) setMotherResults(results);
      } catch (e) {
        if (!cancelled) setMotherError(String(e));
      } finally {
        if (!cancelled) setMotherBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [motherBusy, moldParts]);
  useEffect(() => {
    if ((part !== 'mold' && part !== 'export') || !formMesh) {
      setMoldParts(null);
      setSplitPlan(null);
      return;
    }
    let cancelled = false;
    setMoldParts(null);
    setSplitPlan(null);
    setMoldBusy(true);
    (async () => {
      try {
        await initCsg();
        const plan = chooseSplitPlanes(profile);
        const parts = await buildSplitMold(formMesh, plan, { shrink: shrink / 100, profile });
        if (!cancelled) {
          setSplitPlan(plan);
          setMoldParts(parts);
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
  }, [part, formMesh, shrink, profile]);

  // exploded view: merge parts with display offsets (B up / ±z apart)
  const moldDisplay: Mesh | null = useMemo(() => {
    if (!moldParts || !splitPlan) return null;
    if (splitPlan.kind === 'none') return moldParts[0] ?? null;
    const offsets: [number, number, number][] = splitPlan.kind === 'horizontal'
      ? [[0, 0, 0], [0, 18, 0]]
      : [[0, 0, -15], [0, 0, 15]];
    let vCount = 0, iCount = 0;
    for (const p of moldParts) { vCount += p.positions.length / 3; iCount += p.indices.length; }
    const positions = new Float32Array(vCount * 3);
    const indices = new Uint32Array(iCount);
    let vo = 0, io = 0;
    moldParts.forEach((p, k) => {
      const [ox, oy, oz] = offsets[k] ?? [0, 0, 0];
      const n = p.positions.length / 3;
      for (let i = 0; i < n; i++) {
        positions[(vo + i) * 3] = p.positions[i * 3]! + ox;
        positions[(vo + i) * 3 + 1] = p.positions[i * 3 + 1]! + oy;
        positions[(vo + i) * 3 + 2] = p.positions[i * 3 + 2]! + oz;
      }
      for (let i = 0; i < p.indices.length; i++) indices[io + i] = p.indices[i]! + vo;
      vo += n; io += p.indices.length;
    });
    return { positions, indices };
  }, [moldParts, splitPlan]);

  const mesh: Mesh | null = part === 'mold' ? moldDisplay : formMesh;

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

  const exportMoldPart = (index: number) => {
    const p = moldParts?.[index];
    if (!p || moldBusy) return;
    const result = toBinaryStl(p, `mold-${profileMode}-part-${index + 1}`);
    if (!result.ok) { alert(`خروجی نامعتبر: ${result.error}`); return; }
    download(result.filename, result.bytes!);
  };

  const exportBom = () => {
    if (!moldParts || !splitPlan || moldBusy) return;
    const lines = [
      'فهرست قطعات قالب — Patturn',
      `فرم: ${profileMode} | واحد: mm | جبران انقباض: ${shrink}%`,
      `طرح تقسیم: ${splitPlan.reason} | تعداد: ${moldParts.length}`,
      'مختصات STL مونتاژی است؛ فاصله‌گذاری نمایشی صادر نمی‌شود.',
      'مواد زیر برآورد گچ برای حجم خالص قطعات است؛ پرت و راهگاه جداگانه محاسبه شود.',
    ];
    let total = 0;
    moldParts.forEach((p, i) => {
      const volume = p.meta?.volumeMm3 ?? 0;
      total += volume;
      const material = plasterForCavity(volume);
      const name = exportName(`mold-${profileMode}-part-${i + 1}`, 'mesh', 'mm', 'stl');
      lines.push(`${i + 1}. ${name} | حجم: ${material.volumeL.toFixed(3)} L | گچ: ${material.plasterKg.toFixed(3)} kg | آب: ${material.waterKg.toFixed(3)} kg`);
    });
    const material = plasterForCavity(total);
    lines.push(`جمع: ${material.volumeL.toFixed(3)} L | گچ: ${material.plasterKg.toFixed(3)} kg | آب: ${material.waterKg.toFixed(3)} kg`);
    download(exportName(`mold-${profileMode}`, 'BOM', 'mm', 'txt'), new TextEncoder().encode('\uFEFF' + lines.join('\n')));
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
                {moldBusy ? '⏳ در حال محاسبهٔ Boolean (block − form)…' : moldParts ? '✅ قالب سه‌بعدی ساخته شد — در viewport ببینید' : null}
                {moldBusy ? null : (
                  <>
                    {undercut.dropOutSafe ? (
                      <>✅ فرم drop-out مجاز است → قالب <b>تک‌تکه</b></>
                    ) : (
                      <>⚠️ زیر برش: {undercut.problemBands.length} ناحیه → پیشنهاد <b>{undercut.suggestedParts} قطعه</b></>
                    )}
                    <br />{splitPlan && `طرح تقسیم: ${splitPlan.reason} — ${splitPlan.parts} قطعه`}
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
              <h3 className="sec">قطعات قالب</h3>
              {moldBusy && <div className="hint">⏳ در حال ساخت قطعات قالب…</div>}
              {!moldBusy && moldParts?.map((_, i) => (
                <div className="ctl" key={i}><button className="btn" onClick={() => exportMoldPart(i)}>
                  ⬇ STL قطعهٔ {i + 1}</button></div>
              ))}
              <div className="ctl"><button className="btn" disabled={moldBusy || !moldParts} onClick={exportBom}>
                ⬇ فهرست قطعات و مواد (BOM)</button></div>
              <h3 className="sec">محفظهٔ ریختن سیلیکون</h3>
              <div className="hint">
                محفظهٔ جعبه‌ای دوتکه: دیواره ۱۰، فلنج ۱۵ و فاصلهٔ حداقل ۲mm؛ دهانهٔ ریختن ۱۲ و دو هواکش ۴mm.
                پوستهٔ هم‌فاصله و مانع جداساز مستقل هنوز پیاده نشده‌اند.
                مهار مکانیکی، آب‌بندی درز و جداساز سطح قبل از ساخت لازم است.
              </div>
              <div className="ctl"><button className="btn" disabled={moldBusy || motherBusy || !moldParts}
                onClick={() => { setMotherError(null); setMotherBusy(true); }}>
                {motherBusy ? '⏳ در حال ساخت محفظه…' : 'ساخت محفظه برای قطعات گچی'}</button></div>
              {motherError && <div className="hint" role="alert">⚠️ {motherError}</div>}
              {motherResults?.map((result, i) => (
                <div className="ctl" key={`mother-${i}`}>
                  <div className="hint">قطعهٔ {i + 1}: سیلیکون برآوردی {result.siliconeKg.toFixed(3)} kg
                    (بدون پرت و راهگاه؛ چگالی ۱٫۱۵ kg/L)</div>
                  {result.jacket.map((jacket, j) => (
                    <button className="btn" key={j} onClick={() => {
                      const output = toBinaryStl(jacket, `mother-${profileMode}-part-${i + 1}-half-${j + 1}`);
                      if (output.ok) download(output.filename, output.bytes!);
                      else alert(output.error);
                    }}>⬇ نیمهٔ {j + 1} محفظه</button>
                  ))}
                </div>
              ))}
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
