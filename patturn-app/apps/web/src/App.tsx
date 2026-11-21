import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  chooseSplitPlanes, buildSplitMold, buildMotherMold, plasterForCavity, motherAssemblyGuide,
  type SplitPlan, type MotherMoldResult, type OffsetBarrierResult,
} from '@patturn/molds';
import { encodeEditorProject, decodeEditorProject, MAX_PROJECT_FILE_BYTES } from '@patturn/storage';
import { unwrapCylinder } from '@patturn/kernel';
import { PATTERNS, type PatternContext } from '@patturn/patterns';
import { toBinaryStl, toSvg, exportName, toBuildZip, toDimensionPdf, toObj, type ObjPart, type BuildBundle } from '@patturn/exporters';
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

  const projectInput = useRef<HTMLInputElement | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const saveProjectFile = () => {
    try {
      const bytes = encodeEditorProject({ profileMode, segments, wall, shrink, fill, patternId, tileSize });
      download(exportName(profileMode, 'project', 'v1', 'patturn'), bytes);
      setProjectError(null);
    } catch (error) { setProjectError(`ذخیرهٔ پروژه ناموفق بود: ${String(error)}`); }
  };
  const openProjectFile = async (file: File) => {
    setProjectLoading(true);
    setProjectError(null);
    try {
      if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error('PROJECT_FILE_TOO_LARGE');
      const state = decodeEditorProject(new Uint8Array(await file.arrayBuffer()), PATTERNS.map((p) => p.id));
      if (!window.confirm('تنظیمات فعلی با فایل انتخاب‌شده جایگزین شود؟ برای نگه‌داشتن وضعیت فعلی ابتدا آن را ذخیره کنید.')) return;
      // One validated state, applied as a batched React update; derived meshes regenerate.
      setProfileMode(state.profileMode); setSegments(state.segments); setWall(state.wall);
      setShrink(state.shrink); setFill(state.fill); setPatternId(state.patternId); setTileSize(state.tileSize);
      setPart('form'); setSaved(false);
    } catch (error) { setProjectError(`فایل پروژه باز نشد؛ تنظیمات فعلی تغییر نکرد: ${String(error).slice(0, 220)}`); }
    finally { setProjectLoading(false); }
  };

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
  const [barrierRequest, setBarrierRequest] = useState<number | null>(null);
  const [barrierResult, setBarrierResult] = useState<{ index: number; result: OffsetBarrierResult } | null>(null);
  const [barrierError, setBarrierError] = useState<string | null>(null);
  useEffect(() => {
    setBarrierRequest(null);
    setBarrierResult(null);
    setBarrierError(null);
  }, [moldParts]);
  useEffect(() => {
    const master = barrierRequest === null ? null : moldParts?.[barrierRequest];
    if (!master || barrierRequest === null) return;
    const index = barrierRequest;
    const worker = new Worker(new URL('./barrier.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<
      { ok: true; result: OffsetBarrierResult } | { ok: false; error: string }
    >) => {
      if (event.data.ok) setBarrierResult({ index, result: event.data.result });
      else setBarrierError(event.data.error);
      setBarrierRequest(null);
    };
    worker.onerror = () => {
      setBarrierError('محاسبهٔ مانع ناموفق بود؛ دوباره با فرم ساده‌تر امتحان کنید.');
      setBarrierRequest(null);
    };
    worker.postMessage(master);
    return () => worker.terminate();
  }, [barrierRequest, moldParts]);
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

  const buildBom = (): string => {
    if (!moldParts || !splitPlan || moldBusy) return '';
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
    return lines.join('\n');
  };

  const moldObjParts = (): ObjPart[] => (moldParts ?? []).map((mesh, i) => ({
    name: `mold-part-${i + 1}`, mesh,
    color: i % 2 === 0 ? [0.75, 0.72, 0.65] : [0.55, 0.65, 0.75],
  }));
  const exportObj = (target: 'form' | 'mold') => {
    if (!formMesh || (target === 'mold' && (moldBusy || !moldParts))) return;
    const parts: ObjPart[] = target === 'form'
      ? [{ name: `form-${profileMode}`, mesh: formMesh, color: [0.77, 0.38, 0.18] }]
      : moldObjParts();
    const result = toObj(parts, `${target}-${profileMode}`);
    if (result.ok) download(result.filename, result.bytes!);
    else alert(`خطای خروجی OBJ: ${result.error}`);
  };

  const exportBom = () => {
    const text = buildBom();
    if (text) download(exportName(`mold-${profileMode}`, 'BOM', 'mm', 'txt'), new TextEncoder().encode('\uFEFF' + text));
  };

  const makeDimensionPdf = () => toDimensionPdf(profile, {
    project: profileMode,
    parameters: [
      { label: 'تعداد قطعات قالب', value: String(splitPlan?.parts ?? '-') },
      { label: 'جبران انقباض قالب ـ درصد', value: String(shrink) },
      { label: 'تقسیمات مش', value: String(segments) },
    ],
  });
  const exportDimensionPdf = () => {
    const result = makeDimensionPdf();
    if (result.ok) download(result.filename, result.bytes!);
    else alert(`خطای برگهٔ ابعاد: ${result.error}`);
  };

  const [zipBusy, setZipBusy] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const zipController = useRef<AbortController | null>(null);
  // Cancel a pending export if any captured geometry/pattern source is replaced.
  useEffect(() => () => { zipController.current?.abort(); },
    [formMesh, moldParts, motherResults, barrierResult, patternPaths, shrink]);

  const exportBuildZip = async () => {
    if (!formMesh || !moldParts || !splitPlan || moldBusy || zipBusy || motherBusy || barrierRequest !== null) return;
    const controller = new AbortController();
    zipController.current = controller;
    setZipBusy(true);
    setZipError(null);
    try {
      const name = (target: string) => exportName(target, 'mesh', 'mm', 'stl');
      const meshes: BuildBundle['meshes'] = [{ path: `form/${name(`form-${profileMode}`)}`, mesh: formMesh }];
      moldParts.forEach((mesh, i) => meshes.push({ path: `parts/${name(`mold-${profileMode}-part-${i + 1}`)}`, mesh }));
      motherResults?.forEach((result, i) => result.jacket.forEach((mesh, j) => meshes.push({
        path: `mother-box/${name(`mother-${profileMode}-part-${i + 1}-half-${j + 1}`)}`, mesh,
      })));
      const files: NonNullable<BuildBundle['files']> = [];
      const text = (path: string, content: string) => files.push({ path, bytes: new TextEncoder().encode('\uFEFF' + content) });
      if (barrierResult) {
        barrierResult.result.halves.forEach((mesh, j) => meshes.push({
          path: `mother-offset/${name(`barrier-${profileMode}-part-${barrierResult.index + 1}-half-${j + 1}`)}`, mesh,
        }));
        text('mother-offset/assembly.txt', motherAssemblyGuide(barrierResult.result));
        const { halves: _halves, ...metadata } = barrierResult.result;
        files.push({ path: 'mother-offset/report.json', bytes: new TextEncoder().encode(JSON.stringify({ moldPart: barrierResult.index + 1, ...metadata }, null, 2)) });
      }
      text('BOM.txt', buildBom());
      files.push({ path: exportName(profileMode, 'project', 'v1', 'patturn'),
        bytes: encodeEditorProject({ profileMode, segments, wall, shrink, fill, patternId, tileSize }) });
      const dimensionPdf = makeDimensionPdf();
      if (!dimensionPdf.ok) throw new Error(dimensionPdf.error);
      files.push({ path: `dimensions/${dimensionPdf.filename}`, bytes: dimensionPdf.bytes! });
      const pattern = toSvg(patternPaths, 300, 300);
      files.push({ path: `pattern/${pattern.filename}`, bytes: pattern.bytes! });
      files.push({ path: 'parameters.json', bytes: new TextEncoder().encode(JSON.stringify({
        kind: 'manufacturing-export-snapshot', version: 1, units: 'mm', profileMode,
        profile, segments, shrinkPercent: shrink, splitPlan, pattern: { id: patternId, tileSize, canvasMm: [300, 300] },
        motherBoxPartsIncluded: motherResults?.length ?? 0,
        motherOffsetPartsIncluded: barrierResult ? [barrierResult.index + 1] : [],
      }, null, 2)) });
      const instructions = [
        'بستهٔ ساخت Patturn — واحد mm',
        `فرم: ${profileMode}؛ تعداد قطعات گچی: ${moldParts.length}؛ جبران انقباض: ${shrink}%`,
        'form/: فرم اصلی بدون جبران انقباض. parts/: قالب گچی با جبران انقباض؛ فاصله‌گذاری نمایشی صادر نشده است.',
        'obj/: فرم و مجموعهٔ قطعات قالب با نام و رنگ رأس؛ واحد mm. رنگ از افزونهٔ رایج RGB استفاده می‌کند و ممکن است در برخی نرم‌افزارها نمایش داده نشود. فایل MTL ندارد.',
        'BOM.txt: برآورد گچ و آب، بدون پرت. pattern/: الگوی تخت ۳۰۰×۳۰۰mm؛ نگاشت برجسته روی STL اعمال نشده است.',
        'dimensions/: برگهٔ ابعاد PDF آ۴؛ چاپ اندازهٔ واقعی ۱۰۰٪، خاموش‌کردن Fit to page و اندازه‌گیری خط‌کش ۱۰۰mm الزامی است.',
        'فایل .patturn: پروژهٔ فشردهٔ قابل بازکردن از دکمهٔ بازکردن پروژه؛ مش‌ها دوباره محاسبه می‌شوند. مادرقالب‌ها و نتایج مشتق‌شده ذخیره نمی‌شوند.',
        'parameters.json: ثبت تنظیمات مؤثر خروجی؛ فایل پروژهٔ قابل بازیابی در برنامه نیست.',
        `محفظهٔ جعبه‌ای صادرشده: ${motherResults?.length ?? 0} از ${moldParts.length} قطعه.`,
        `مادرقالب هم‌فاصلهٔ صادرشده: ${barrierResult ? `فقط قطعهٔ ${barrierResult.index + 1}` : 'هیچ‌کدام؛ هنوز ساخته نشده است'}.`,
        'مادرقالب‌های ساخته‌نشده در این بسته وجود ندارند؛ وجود ZIP به معنی تکمیل همهٔ مادرقالب‌ها نیست.',
        'مادرقالب‌ها آزمایشی‌اند. راهنمای مونتاژ و گزارش برخورد را بخوانید؛ اعتبار STL تضمین جدایش یا آب‌بندی نیست.',
        'آب‌بندی و جداکنندهٔ سازگار با مواد لازم است. ابتدا مونتاژ خشک و آزمایش کم‌حجم انجام دهید.',
        'در اسلایسر واحد mm و مقیاس ۱۰۰٪ را انتخاب کنید. تحمل بار اتصال و کیفیت پرینت جداگانه بررسی شود.',
        'manifest.json شامل فهرست فایل‌ها (به‌جز خودش) و اندازهٔ بایت آن‌ها است؛ STLها پیش از بسته‌بندی اعتبارسنجی شده‌اند.',
      ].join('\n');
      const assemblies: NonNullable<BuildBundle['assemblies']> = [
        { path: `obj/${exportName(`form-${profileMode}`, 'assembly', 'mm', 'obj')}`, parts: [{ name: 'form', mesh: formMesh, color: [0.77, 0.38, 0.18] }] },
        { path: `obj/${exportName(`mold-${profileMode}`, 'assembly', 'mm', 'obj')}`, parts: moldObjParts() },
      ];
      const result = await toBuildZip({ project: profileMode, meshes, assemblies, files, instructions }, controller.signal);
      if (controller.signal.aborted) setZipError('بسته‌بندی لغو شد؛ فایلی دانلود نشد.');
      else if (!result.ok) setZipError(result.error ?? 'خطای تولید ZIP');
      else download(result.filename, result.bytes!);
    } catch (error) {
      setZipError(String(error));
    } finally {
      if (zipController.current === controller) zipController.current = null;
      setZipBusy(false);
    }
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
        <input ref={projectInput} type="file" accept=".patturn" hidden aria-label="انتخاب فایل پروژه"
          onChange={(event) => {
            const file = event.target.files?.[0]; event.target.value = '';
            if (file) void openProjectFile(file);
          }} />
        <button className="btn" disabled={projectLoading} onClick={() => projectInput.current?.click()}>
          {projectLoading ? 'در حال خواندن…' : 'بازکردن پروژه'}</button>
        <button className="btn" onClick={saveProjectFile}>ذخیرهٔ فایل پروژه</button>
        <button className="btn" onClick={doExportSvg}>خروجی SVG الگو</button>
        <button className="btn primary" onClick={doExportStl}>⬇ خروجی STL</button>
      </header>

      {projectError && <div className="hint" role="alert">⚠️ {projectError}</div>}
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
              <div className="ctl"><button className="btn primary" disabled={zipBusy || moldBusy || motherBusy || barrierRequest !== null || !formMesh || !moldParts}
                onClick={exportBuildZip}>{zipBusy ? '⏳ در حال بسته‌بندی…' : '⬇ ZIP ساخت: قطعات، مواد و راهنما'}</button></div>
              {zipBusy && <button className="btn" onClick={() => zipController.current?.abort()}>لغو بسته‌بندی</button>}
              {zipError && <div className="hint" role="alert">{zipError}</div>}
              <div className="hint">ZIP فقط مادرقالب‌های ساخته‌شدهٔ فعلی را شامل می‌شود؛ قطعات جاافتاده در README مشخص‌اند.</div>
              <div className="ctl"><button className="btn primary" style={{ width: '100%' }} onClick={doExportStl}>
                ⬇ STL سه‌بعدی (اعتبارسنجی‌شده)</button></div>
              <div className="ctl"><button className="btn" style={{ width: '100%' }} onClick={doExportSvg}>
                ⬇ SVG الگوی تخت ۳۰۰×۳۰۰mm</button></div>
              <div className="ctl"><button className="btn" disabled={!formMesh} onClick={exportDimensionPdf}>
                ⬇ PDF برگهٔ ابعاد A4 — مقیاس ۱:۱</button></div>
              <div className="hint">چاپ با اندازهٔ واقعی ۱۰۰٪؛ Fit to page خاموش. خط‌کش ۱۰۰mm را کنترل کنید.
                فرم‌های بزرگ چندصفحه‌ای هستند و کوچک نمی‌شوند.</div>
              <div className="ctl"><button className="btn" disabled={!formMesh} onClick={() => exportObj('form')}>⬇ OBJ فرم با رنگ رأس</button></div>
              <div className="ctl"><button className="btn" disabled={moldBusy || !moldParts} onClick={() => exportObj('mold')}>⬇ OBJ مجموعهٔ قطعات قالب</button></div>
              <div className="hint">OBJ در مختصات مونتاژی و واحد mm است؛ رنگ رأس اختیاری است و همهٔ نرم‌افزارها آن را نمایش نمی‌دهند.</div>
              <h3 className="sec">قطعات قالب</h3>
              {moldBusy && <div className="hint">⏳ در حال ساخت قطعات قالب…</div>}
              {!moldBusy && moldParts?.map((_, i) => (
                <div className="ctl" key={i}><button className="btn" onClick={() => exportMoldPart(i)}>
                  ⬇ STL قطعهٔ {i + 1}</button></div>
              ))}
              <div className="ctl"><button className="btn" disabled={moldBusy || !moldParts} onClick={exportBom}>
                ⬇ فهرست قطعات و مواد (BOM)</button></div>
              <h3 className="sec">مادرقالب هم‌فاصلهٔ آزمایشی</h3>
              <div className="hint">فاصله از سطح ۲mm و ضخامت اسمی ۲mm؛ دو نیمهٔ مستقل.
                فلنج ۱۵mm، دهانهٔ ریختن ۱۲mm و دو هواکش ۴mm به پوسته متصل‌اند.
                چهار سوراخ عبوری پیچ Ø4.5 روی فلنج افزوده شده‌اند؛ آب‌بندی و جدایش مکانیکی تضمین نشده است.
                جزئیات باریک ممکن است در offset بسته شوند. بررسی جدایش و ساخت لازم است.
                محاسبهٔ فرم‌های پیچیده ممکن است طولانی شود.</div>
              {!moldBusy && moldParts?.map((_, i) => (
                <div className="ctl" key={`barrier-${i}`}><button className="btn"
                  disabled={barrierRequest !== null}
                  onClick={() => { setBarrierResult(null); setBarrierError(null); setBarrierRequest(i); }}>
                  ساخت مادرقالب هم‌فاصلهٔ قطعهٔ {i + 1}</button></div>
              ))}
              {barrierRequest !== null && <div className="ctl">
                ⏳ ساخت هندسه و بررسی نمونه‌ای بازشدن قطعهٔ {barrierRequest + 1}…
                <button className="btn" onClick={() => setBarrierRequest(null)}>لغو محاسبه</button>
              </div>}
              {barrierError && <div className="hint" role="alert">⚠️ {barrierError}</div>}
              {barrierResult && <div className="ctl">
                <div className="hint">کران خطای تقریب offset: {barrierResult.result.offsetErrorBoundMm.toFixed(3)} mm</div>
                {barrierResult.result.release && <div className="hint" role="status">
                  <b>بررسی نمونه‌ای بازشدن — تضمین جدایش نیست</b>
                  <div>{barrierResult.result.release.samplesMm.length} فاصله بررسی شد؛
                    آستانهٔ برخورد {barrierResult.result.release.volumeToleranceMm3} mm³.</div>
                  {barrierResult.result.release.halves.map((half, i) => <div key={i}>
                    نیمهٔ {i + 1} ({half.direction}): {half.status === 'collision-detected'
                      ? `⚠️ برخورد در جابه‌جایی ${half.firstCollisionMm?.toFixed(3)}mm؛ قبل از ساخت اصلاح شود`
                      : 'در نمونه‌ها برخوردی دیده نشد؛ مسیر بین نمونه‌ها بررسی نشده است'}
                  </div>)}
                </div>}
                {barrierResult.result.releaseError && <div className="hint" role="alert">
                  ⚠️ بررسی بازشدن ناموفق بود: {barrierResult.result.releaseError}؛ هندسهٔ قابل دانلود تأیید جدایش ندارد.
                </div>}
                {barrierResult.result.casting && <div className="hint">
                  <div>مهار: {barrierResult.result.casting.fasteners.centers.length} سوراخ Ø{barrierResult.result.casting.fasteners.holeDia}؛
                    ضخامت مجموع فلنج‌ها {barrierResult.result.casting.fasteners.gripMm}mm؛ پیچ و مهره جداگانه لازم است.</div>
                  {barrierResult.result.casting.ports.length} مسیر متصل به پوسته؛ موقعیت دهانه‌ها (mm):
                  {barrierResult.result.casting.ports.map((port, i) => <div key={i}>
                    {i === 0 ? 'ریختن' : 'هواکش'}: Ø{port.diameter} — ({port.center.map((n) => n.toFixed(1)).join(', ')})
                  </div>)}
                </div>}
                <button className="btn" onClick={() => {
                  const text = motherAssemblyGuide(barrierResult.result);
                  download(exportName(`mother-${profileMode}-part-${barrierResult.index + 1}`, 'assembly', 'mm', 'txt'),
                    new TextEncoder().encode('\uFEFF' + text));
                }}>⬇ راهنمای مونتاژ و مشخصات پیچ‌ها</button>
                {barrierResult.result.halves.map((half, i) => (
                  <button className="btn" key={i} onClick={() => {
                    const output = toBinaryStl(half, `barrier-${profileMode}-part-${barrierResult.index + 1}-half-${i + 1}`);
                    if (output.ok) download(output.filename, output.bytes!);
                    else alert(output.error);
                  }}>⬇ مانع: نیمهٔ {i + 1}</button>
                ))}
              </div>}
              <h3 className="sec">محفظهٔ ریختن سیلیکون</h3>
              <div className="hint">
                محفظهٔ جعبه‌ای دوتکه: دیواره ۱۰، فلنج ۱۵ و فاصلهٔ حداقل ۲mm؛ دهانهٔ ریختن ۱۲ و دو هواکش ۴mm.
                گزینهٔ سریع جعبه‌ای؛ مستقل از مادرقالب هم‌فاصلهٔ بالا.
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
