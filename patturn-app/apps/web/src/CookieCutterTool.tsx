import { DeferredTool } from './DeferredTool';
import { readCutterFile, writeCutterFile } from './cutter-file';
import { cutterSketchSeed } from './cutter-sketch';
import { CutterSketch } from './CutterSketch';
import { tracedCutterGeometry } from './traced-cutter';
import { cutterSvgPoints } from './cutter-svg';
import { cookieCutter as text } from './messages/fa.json';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildCircularCutter,
  circularCutterProfile,
  buildConvexCutter,
  convexCutterProfile,
  type CutterPoint,
  validateMesh,
} from '@patturn/kernel';
import { toBinaryStl, toCutterSvg, exportName } from '@patturn/exporters';
import { NumericControl } from './NumericControl';
import { formatNumber } from './number-format';
const loadOrthogonalCutterTool = () =>
  import('./OrthogonalCutterTool').then((module) => ({ default: module.OrthogonalCutterTool }));
export function CookieCutterTool({
  onExport,
  sourceContours,
}: {
  onExport: (name: string, bytes: Uint8Array) => void;
  sourceContours?: readonly (readonly CutterPoint[])[];
}) {
  const [diameterMm, setDiameter] = useState(60),
    [heightMm, setHeight] = useState(20),
    [wallMm, setWall] = useState(1.6),
    [tipMm, setTip] = useState(0.6);
  const [error, setError] = useState('');
  const [contour, setContour] = useState<CutterPoint[] | null>(null);
  const [sketchSeed, setSketchSeed] = useState<CutterPoint[]>([]);
  const [manual, setManual] = useState(false),
    [manualContour, setManualContour] = useState<CutterPoint[] | null>(null);
  const [importBusy, setImportBusy] = useState(false),
    [importFailed, setImportFailed] = useState(false);
  const request = useRef(0),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current++;
    };
  }, []);

  const sourceMode = sourceContours !== undefined;
  const polygonMode = sourceMode || manual || contour !== null;
  const geometry = useMemo(() => {
    if (importBusy || importFailed) return null;
    try {
      const options = { diameterMm, heightMm, wallMm, tipMm };
      if (manual)
        return manualContour
          ? { ...circularCutterProfile(options), ...tracedCutterGeometry([manualContour], options) }
          : null;
      if (sourceContours !== undefined)
        return {
          ...circularCutterProfile(options),
          ...tracedCutterGeometry(sourceContours, options),
        };
      const polygon = contour ? convexCutterProfile(contour, options) : null;
      const mesh = contour ? buildConvexCutter(contour, options) : buildCircularCutter(options);
      return { ...circularCutterProfile(options), polygon, mesh, report: validateMesh(mesh) };
    } catch {
      return null;
    }
  }, [
    diameterMm,
    heightMm,
    wallMm,
    tipMm,
    contour,
    importBusy,
    importFailed,
    sourceContours,
    manual,
    manualContour,
  ]);
  return (
    <>
      <p className="hint">{sourceMode ? text.traceIntro : text.intro}</p>
      {!sourceMode && (
        <>
          {!manual && (
            <label>
              {text.fileInput}
              <input
                type="file"
                accept=".json,application/json"
                disabled={importBusy}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (!file) return;
                  const id = ++request.current;
                  setImportBusy(true);
                  setImportFailed(false);
                  setError('');
                  void (async () => {
                    try {
                      if (file.size > 64 * 1024) throw Error('CUTTER_FILE_TOO_LARGE');
                      const doc = readCutterFile(await file.text());
                      const seed =
                        doc.shape.kind === 'polygon' ? cutterSketchSeed(doc.shape.points) : [];
                      if (!alive.current || request.current !== id) return;
                      setHeight(doc.heightMm);
                      setWall(doc.wallMm);
                      setTip(doc.tipMm);
                      setContour(null);
                      setManualContour(null);
                      setSketchSeed(seed);
                      if (doc.shape.kind === 'circle') {
                        setDiameter(doc.shape.diameterMm);
                        setManual(false);
                      } else setManual(true);
                    } catch {
                      if (alive.current && request.current === id) {
                        setImportFailed(true);
                        setError(text.fileError);
                      }
                    } finally {
                      if (alive.current && request.current === id) setImportBusy(false);
                    }
                  })();
                }}
              />
            </label>
          )}
          {!manual && (
            <button
              type="button"
              className="btn"
              disabled={importBusy}
              onClick={() => {
                request.current++;
                setContour(null);
                setImportFailed(false);
                setError('');
                setManualContour(null);
                setSketchSeed([]);
                setManual(true);
              }}
            >
              {text.startSketch}
            </button>
          )}
          {!manual && contour && !importBusy && !importFailed && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                try {
                  const seed = cutterSketchSeed(contour);
                  request.current++;
                  setSketchSeed(seed);
                  setManualContour(null);
                  setContour(null);
                  setError('');
                  setManual(true);
                } catch {
                  setError(text.svgError);
                }
              }}
            >
              {text.editImported}
            </button>
          )}
          {manual && <CutterSketch initialPoints={sketchSeed} onChange={setManualContour} />}
          {!manual && (
            <>
              <label>
                {text.svgInput}
                <input
                  type="file"
                  accept=".svg,image/svg+xml"
                  disabled={importBusy}
                  aria-describedby="cutter-svg-help"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    if (!file) return;
                    const id = ++request.current;
                    setImportBusy(true);
                    setImportFailed(false);
                    setError('');
                    void (async () => {
                      try {
                        if (file.size > 64 * 1024) throw Error('CUTTER_SVG_TOO_LARGE');
                        const points = cutterSvgPoints(await file.text());
                        convexCutterProfile(points, { heightMm: 20, wallMm: 1.6, tipMm: 0.6 });
                        if (alive.current && request.current === id) setContour(points);
                      } catch {
                        if (alive.current && request.current === id) {
                          setImportFailed(true);
                          setError(text.svgError);
                        }
                      } finally {
                        if (alive.current && request.current === id) setImportBusy(false);
                      }
                    })();
                  }}
                />
              </label>
              <p id="cutter-svg-help" className="hint">
                {text.svgHelp}
              </p>
            </>
          )}
          {(manual || contour || importFailed || importBusy) && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                request.current++;
                setContour(null);
                setManual(false);
                setManualContour(null);
                setImportBusy(false);
                setImportFailed(false);
                setError('');
              }}
            >
              {text.resetCircle}
            </button>
          )}
        </>
      )}
      {[
        { label: text.diameter, value: diameterMm, set: setDiameter, min: 20, max: 150 },
        { label: text.height, value: heightMm, set: setHeight, min: 10, max: 40 },
        { label: text.wall, value: wallMm, set: setWall, min: 0.8, max: 3 },
        { label: text.tip, value: tipMm, set: setTip, min: 0.4, max: 1.2 },
      ]
        .filter((control) => !polygonMode || control.label !== text.diameter)
        .map((control) => (
          <NumericControl
            key={control.label}
            label={control.label}
            value={control.value}
            step={control.min < 1 ? 0.1 : 1}
            min={control.min}
            max={control.max}
            onChange={(value) => {
              control.set(value);
              setError('');
            }}
            onBeginEdit={() => {}}
            onEndEdit={() => {}}
          />
        ))}
      {geometry && !geometry.polygon && (
        <>
          <svg
            viewBox={`0 -${heightMm + 4} ${diameterMm / 2 + wallMm + 8} ${heightMm + 8}`}
            role="img"
            aria-label={text.preview}
          >
            <path
              d={geometry.rings.map((p, i) => `${i ? 'L' : 'M'}${p.r} ${-p.y}`).join(' ') + ' Z'}
              fill="#3f6c7a"
            />
          </svg>
          <p>
            {text.opening} {formatNumber(geometry.minimumOpeningMm)} {text.geometry}
          </p>
        </>
      )}
      {geometry?.polygon && (
        <>
          <svg
            role="img"
            aria-label={text.polygonPreview}
            viewBox={`${-geometry.polygon.width / 2 - 30} ${-geometry.polygon.depth / 2 - 30} ${geometry.polygon.width + 60} ${geometry.polygon.depth + 60}`}
          >
            <path
              fill="#3f6c7a"
              fillRule="evenodd"
              d={[geometry.polygon.loops.at(-2)!.points, geometry.polygon.points]
                .map(
                  (points) =>
                    points.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ') + ' Z',
                )
                .join(' ')}
            />
          </svg>
          <p>
            {text.polygonSize} {formatNumber(geometry.polygon.width)} ×{' '}
            {formatNumber(geometry.polygon.depth)} mm
          </p>
        </>
      )}
      <p role="status" aria-label={text.status}>
        {importBusy
          ? text.fileLoading
          : importFailed
            ? text.importInvalid
            : geometry?.report.ok
              ? text.valid
              : sourceMode
                ? text.traceInvalid
                : manual
                  ? text.sketchPending
                  : text.invalid}
      </p>
      <p className="hint">{text.safety}</p>
      <button
        type="button"
        className="btn"
        disabled={!geometry?.report.ok}
        onClick={() => {
          if (!geometry?.report.ok) return;
          const result = toBinaryStl(
            geometry.mesh,
            polygonMode ? 'convex-cutter' : 'circular-cutter',
          );
          if (!result.ok || !result.bytes) {
            setError(text.exportError);
            return;
          }
          onExport(
            exportName(
              polygonMode ? 'convex-cutter' : 'circular-cutter',
              'ring',
              geometry.polygon
                ? `W${geometry.polygon.width}-D${geometry.polygon.depth}-H${heightMm}mm`
                : `D${diameterMm}-H${heightMm}-W${wallMm}-T${tipMm}mm`,
              'stl',
            ),
            result.bytes,
          );
        }}
      >
        {polygonMode ? text.polygonDownload : text.download}
      </button>
      {polygonMode && (
        <>
          <p className="hint">{text.svgExportHelp}</p>
          <button
            type="button"
            className="btn"
            disabled={!geometry?.report.ok || !geometry.polygon}
            onClick={() => {
              if (!geometry?.report.ok || !geometry.polygon) return;
              const result = toCutterSvg(geometry.polygon.points);
              if (!result.ok || !result.bytes) {
                setError(text.svgExportError);
                return;
              }
              onExport(result.filename, result.bytes);
            }}
          >
            {text.svgDownload}
          </button>
        </>
      )}
      <p className="hint">{text.fileHelp}</p>
      <button
        type="button"
        className="btn"
        disabled={!geometry?.report.ok}
        onClick={() => {
          if (!geometry?.report.ok) return;
          try {
            const bytes = writeCutterFile({
              format: 'patturn-cutter',
              version: 1,
              units: 'mm',
              heightMm,
              wallMm,
              tipMm,
              shape: geometry.polygon
                ? { kind: 'polygon', points: geometry.polygon.points }
                : { kind: 'circle', diameterMm },
            });
            onExport('patturn-cutter.cutter.json', bytes);
          } catch {
            setError(text.fileError);
          }
        }}
      >
        {text.fileSave}
      </button>
      {error && <p role="alert">{error}</p>}
      {!sourceMode && (
        <DeferredTool
          label={text.orthogonalTitle}
          className="orthogonal-cutter-tool"
          load={loadOrthogonalCutterTool}
          toolProps={{ onExport }}
        />
      )}
    </>
  );
}
