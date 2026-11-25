import { OrthogonalBooleanEditor } from './OrthogonalBooleanEditor';
import { seedOrthogonalSketch } from './orthogonal-sketch';
import { OrthogonalSketchEditor } from './OrthogonalSketchEditor';
import { transformOrthogonalContour, type OrthogonalTransform } from './orthogonal-transform';
import { tracedOrthogonalCutterGeometry, snapshotTracedOrthogonalCutter } from './traced-cutter';
import { OrthogonalDragEditor } from './OrthogonalDragEditor';
import { OrthogonalNotchEditor } from './OrthogonalNotchEditor';
import { initialSketchHistory, sketchHistory } from './sketch-history';
import { historyShortcut } from './history-shortcut';
import { preserveNativeUndo } from './native-undo';
import { OrthogonalVertexEditor } from './OrthogonalVertexEditor';
import { openOrthogonalContour } from './orthogonal-vertex';
import {
  readOrthogonalCutterFile,
  writeOrthogonalCutterFile,
  type OrthogonalCutterFile,
} from './orthogonal-cutter-file';
import { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import {
  buildOrthogonalCutter,
  orthogonalCutterProfile,
  validateMesh,
  type CutterPoint,
} from '@patturn/kernel';
import { toBinaryStl, toOrthogonalCutterSvg, exportName } from '@patturn/exporters';
import { cutterSvgPoints } from './cutter-svg';
import { NumericControl } from './NumericControl';
import { formatNumber } from './number-format';
import { orthogonalCutter as text } from './messages/fa.json';
const samples: Record<'L' | 'U', readonly CutterPoint[]> = {
  L: [
    [0, 0],
    [80, 0],
    [80, 30],
    [30, 30],
    [30, 80],
    [0, 80],
  ],
  U: [
    [0, 0],
    [100, 0],
    [100, 100],
    [70, 100],
    [70, 30],
    [30, 30],
    [30, 100],
    [0, 100],
  ],
};
/** Isolated experimental SVG/STL tool. Does not relax the existing convex file/editor contracts. */
export function OrthogonalCutterTool({
  onExport,
  sourceContours,
  initialFile,
  onCopy,
}: {
  onExport: (name: string, bytes: Uint8Array) => void;
  sourceContours?: readonly (readonly CutterPoint[])[];
  initialFile?: OrthogonalCutterFile;
  onCopy?: (file: OrthogonalCutterFile) => void;
}) {
  const [editorMode, setEditorMode] = useState<'corner' | 'notch' | 'drag' | 'draw' | 'boolean'>(
    'corner',
  );
  const notchMode = editorMode === 'notch';
  const [dragging, setDragging] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const [rectangleOutward, setRectangleOutward] = useState(false);
  const [sketchSeed, setSketchSeed] = useState<CutterPoint[]>([]);
  const [history, dispatch] = useReducer(
    sketchHistory,
    initialFile?.points ?? samples.L,
    initialSketchHistory,
  );
  const sourceMode = sourceContours !== undefined;
  const points =
    sourceContours === undefined
      ? history.points
      : sourceContours.length === 1
        ? sourceContours[0]!
        : [];
  const [heightMm, setHeight] = useState(initialFile?.heightMm ?? 20),
    [wallMm, setWall] = useState(initialFile?.wallMm ?? 1.6),
    [tipMm, setTip] = useState(initialFile?.tipMm ?? 0.6);
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false),
    [error, setError] = useState('');
  const request = useRef(0),
    alive = useRef(true);
  const help = useId();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current++;
    };
  }, []);
  const geometry = useMemo(() => {
    if (!sourceMode && (busy || failed || draftDirty || editorMode === 'draw')) return null;
    try {
      const options = { heightMm, wallMm, tipMm };
      if (sourceContours !== undefined) {
        const result = tracedOrthogonalCutterGeometry(sourceContours, options);
        return result.report.ok ? result : null;
      }
      const profile = orthogonalCutterProfile(points, options),
        mesh = buildOrthogonalCutter(points, options);
      const report = validateMesh(mesh);
      return report.ok ? { profile, mesh, report } : null;
    } catch {
      return null;
    }
  }, [
    points,
    heightMm,
    wallMm,
    tipMm,
    busy,
    failed,
    draftDirty,
    sourceMode,
    sourceContours,
    editorMode,
  ]);
  const stepHistory = (direction: 'undo' | 'redo') => {
    if (
      sourceMode ||
      busy ||
      failed ||
      dragging ||
      !(direction === 'undo' ? history.past.length : history.future.length)
    )
      return;
    setDraftDirty(false);
    setError('');
    setEditorRevision((value) => value + 1);
    setEditorMode((mode) => (mode === 'draw' ? 'corner' : mode));
    dispatch({ type: direction });
  };
  return (
    <div
      className="orthogonal-history-scope"
      role="group"
      aria-label={sourceMode ? text.traceScope : text.historyScope}
      tabIndex={0}
      onKeyDown={(event) => {
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          preserveNativeUndo(target.tagName, target.getAttribute('type'), target.isContentEditable)
        )
          return;
        const direction = historyShortcut(event.nativeEvent);
        if (!direction) return;
        event.preventDefault();
        event.stopPropagation();
        stepHistory(direction);
      }}
    >
      <p className="hint">{sourceMode ? text.traceIntro : text.intro}</p>
      {!sourceMode && (
        <>
          <p className="hint">{text.historyHelp}</p>
          <button
            type="button"
            className="btn"
            disabled={busy || failed || dragging || !history.past.length}
            onClick={() => stepHistory('undo')}
          >
            {text.historyUndo}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || failed || dragging || !history.future.length}
            onClick={() => stepHistory('redo')}
          >
            {text.historyRedo}
          </button>
          <fieldset disabled={busy || failed || dragging || draftDirty || !geometry}>
            <legend>{text.transformLegend}</legend>
            <p className="hint">{text.transformHelp}</p>
            {(['clockwise', 'counterclockwise', 'mirrorX', 'mirrorY'] as const).map(
              (operation: OrthogonalTransform) => (
                <button
                  key={operation}
                  type="button"
                  className="btn"
                  onClick={() => {
                    if (busy || failed || dragging || draftDirty || !geometry) return;
                    try {
                      const next = transformOrthogonalContour(points, operation, {
                        heightMm,
                        wallMm,
                        tipMm,
                      });
                      dispatch({ type: 'edit', points: next });
                      setError('');
                      setDraftDirty(false);
                      setEditorRevision((value) => value + 1);
                    } catch {
                      setDraftDirty(true);
                      setError(text.transformError);
                    }
                  }}
                >
                  {text[operation]}
                </button>
              ),
            )}
          </fieldset>
          {(['L', 'U'] as const).map((name) => (
            <button
              key={name}
              type="button"
              className="btn"
              disabled={dragging}
              onClick={() => {
                request.current++;
                setBusy(false);
                setFailed(false);
                setError('');
                setDraftDirty(false);
                setEditorRevision((value) => value + 1);
                setEditorMode((mode) => (mode === 'draw' ? 'corner' : mode));
                dispatch({ type: 'edit', points: samples[name] });
              }}
            >
              {name === 'L' ? text.sampleL : text.sampleU}
            </button>
          ))}
          <label>
            {text.fileInput}
            <input
              type="file"
              accept=".json,application/json"
              disabled={busy || dragging}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (!file) return;
                const id = ++request.current;
                setBusy(true);
                setFailed(false);
                setError('');
                void (async () => {
                  try {
                    if (file.size > 65536) throw Error('ORTHOGONAL_FILE_TOO_LARGE');
                    const doc = readOrthogonalCutterFile(await file.text());
                    if (!alive.current || request.current !== id) return;
                    setDraftDirty(false);
                    setEditorRevision((value) => value + 1);
                    setEditorMode((mode) => (mode === 'draw' ? 'corner' : mode));
                    dispatch({ type: 'reset', points: openOrthogonalContour(doc.points) });
                    setHeight(doc.heightMm);
                    setWall(doc.wallMm);
                    setTip(doc.tipMm);
                  } catch {
                    if (alive.current && request.current === id) {
                      setFailed(true);
                      setError(text.fileError);
                    }
                  } finally {
                    if (alive.current && request.current === id) setBusy(false);
                  }
                })();
              }}
            />
          </label>
          <label>
            {text.input}
            <input
              type="file"
              accept=".svg,image/svg+xml"
              disabled={busy || dragging}
              aria-describedby={help}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (!file) return;
                const id = ++request.current;
                setBusy(true);
                setFailed(false);
                setError('');
                void (async () => {
                  try {
                    if (file.size > 64 * 1024) throw Error('ORTHOGONAL_SVG_TOO_LARGE');
                    const contour = cutterSvgPoints(await file.text());
                    // Reject shapes unsupported even at the minimum grip width; current settings validate below.
                    orthogonalCutterProfile(contour, { heightMm: 20, wallMm: 0.8, tipMm: 0.4 });
                    if (alive.current && request.current === id) {
                      setDraftDirty(false);
                      setEditorRevision((value) => value + 1);
                      setEditorMode((mode) => (mode === 'draw' ? 'corner' : mode));
                      dispatch({ type: 'reset', points: openOrthogonalContour(contour) });
                    }
                  } catch {
                    if (alive.current && request.current === id) {
                      setFailed(true);
                      setError(text.importError);
                    }
                  } finally {
                    if (alive.current && request.current === id) setBusy(false);
                  }
                })();
              }}
            />
          </label>
          <p id={help} className="hint">
            {text.svgHelp}
          </p>
        </>
      )}
      {[
        { label: text.height, value: heightMm, set: setHeight, min: 10, max: 40, step: 1 },
        { label: text.wall, value: wallMm, set: setWall, min: 0.8, max: 3, step: 0.1 },
        { label: text.tip, value: tipMm, set: setTip, min: 0.4, max: 1.2, step: 0.1 },
      ].map((control) => (
        <fieldset
          key={control.label}
          disabled={dragging}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <NumericControl
            label={control.label}
            value={control.value}
            min={control.min}
            max={control.max}
            step={control.step}
            onChange={(value) => {
              control.set(value);
              setError('');
            }}
            onBeginEdit={() => {}}
            onEndEdit={() => {}}
          />
        </fieldset>
      ))}
      {!sourceMode && (
        <>
          <button
            type="button"
            className="btn"
            aria-pressed={editorMode === 'draw'}
            disabled={busy || failed || dragging}
            onClick={() => {
              setSketchSeed([]);
              setEditorMode((mode) => (mode === 'draw' ? 'corner' : 'draw'));
              setDraftDirty(false);
              setError('');
              setEditorRevision((value) => value + 1);
            }}
          >
            {text.sketchMode}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || failed || dragging || draftDirty || !geometry}
            onClick={() => {
              if (busy || failed || dragging || draftDirty || !geometry) return;
              try {
                const seed = seedOrthogonalSketch(points, { heightMm, wallMm, tipMm });
                setSketchSeed(seed);
                setEditorMode('draw');
                setDraftDirty(false);
                setError('');
                setEditorRevision((value) => value + 1);
              } catch {
                setDraftDirty(true);
                setError(text.sketchSeedError);
              }
            }}
          >
            {text.sketchSeed}
          </button>
          <p className="hint">{text.sketchSeedHelp}</p>
          {!busy && !failed && editorMode === 'draw' && (
            <OrthogonalSketchEditor
              key={editorRevision}
              initialPoints={sketchSeed}
              options={{ heightMm, wallMm, tipMm }}
              onApply={(next) => {
                dispatch({ type: 'edit', points: next });
                setDraftDirty(false);
                setError('');
                setEditorMode('corner');
                setEditorRevision((value) => value + 1);
              }}
              onCancel={() => {
                setDraftDirty(false);
                setError('');
                setEditorMode('corner');
                setEditorRevision((value) => value + 1);
              }}
            />
          )}
          <button
            type="button"
            className="btn"
            aria-pressed={editorMode === 'boolean'}
            disabled={busy || failed || dragging}
            onClick={() => {
              setEditorMode((mode) => (mode === 'boolean' ? 'corner' : 'boolean'));
              setDraftDirty(false);
              setError('');
              setEditorRevision((value) => value + 1);
            }}
          >
            {text.booleanMode}
          </button>
          {!busy && !failed && editorMode === 'boolean' && (
            <OrthogonalBooleanEditor
              key={editorRevision}
              points={points}
              options={{ heightMm, wallMm, tipMm }}
              onDirty={() => {
                setDraftDirty(true);
                setError('');
              }}
              onApply={(next) => {
                dispatch({ type: 'edit', points: next });
                setDraftDirty(false);
                setError('');
                setEditorRevision((value) => value + 1);
              }}
              onCancel={() => {
                setDraftDirty(false);
                setError('');
              }}
            />
          )}
          <button
            type="button"
            className="btn"
            aria-pressed={notchMode}
            disabled={busy || failed || dragging}
            onClick={() => {
              setEditorMode((mode) => (mode === 'notch' ? 'corner' : 'notch'));
              setDraftDirty(false);
              setError('');
              setEditorRevision((value) => value + 1);
            }}
          >
            {text.notchMode}
          </button>
          {!busy && !failed && notchMode && (
            <OrthogonalNotchEditor
              outward={rectangleOutward}
              onDirectionChange={setRectangleOutward}
              key={editorRevision}
              points={points}
              options={{ heightMm, wallMm, tipMm }}
              onDirty={() => {
                setDraftDirty(true);
                setError('');
              }}
              onApply={(next) => {
                dispatch({ type: 'edit', points: next });
                setDraftDirty(false);
                setError('');
                setEditorRevision((value) => value + 1);
              }}
              onCancel={() => {
                setDraftDirty(false);
                setError('');
              }}
            />
          )}
          <button
            type="button"
            className="btn"
            aria-pressed={editorMode === 'drag'}
            disabled={busy || failed || dragging}
            onClick={() => {
              setEditorMode((mode) => (mode === 'drag' ? 'corner' : 'drag'));
              setDraftDirty(false);
              setError('');
              setEditorRevision((value) => value + 1);
            }}
          >
            {text.dragMode}
          </button>
          {!busy && !failed && editorMode === 'drag' && (
            <OrthogonalDragEditor
              key={editorRevision}
              points={points}
              options={{ heightMm, wallMm, tipMm }}
              onDirty={() => {
                setDraftDirty(true);
                setError('');
              }}
              onActiveChange={setDragging}
              onApply={(next) => {
                dispatch({ type: 'edit', points: next });
                setDraftDirty(false);
                setEditorRevision((value) => value + 1);
              }}
              onCancel={() => {
                setDraftDirty(false);
                setError('');
              }}
            />
          )}
          {!busy && !failed && editorMode === 'corner' && (
            <OrthogonalVertexEditor
              key={editorRevision}
              points={points}
              options={{ heightMm, wallMm, tipMm }}
              onDirty={() => {
                setDraftDirty(true);
                setError('');
              }}
              onApply={(next) => {
                dispatch({ type: 'edit', points: next });
                setDraftDirty(false);
                setError('');
              }}
              onCancel={() => {
                setDraftDirty(false);
                setError('');
              }}
            />
          )}
        </>
      )}
      {geometry && (
        <>
          <svg
            role="img"
            aria-label={text.preview}
            viewBox={`${-geometry.profile.width / 2 - 20} ${-geometry.profile.depth / 2 - 20} ${geometry.profile.width + 40} ${geometry.profile.depth + 40}`}
          >
            <path
              fill="#3f6c7a"
              fillRule="evenodd"
              d={[geometry.profile.loops.at(-2)!.points, geometry.profile.points]
                .map(
                  (contour) =>
                    contour.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ') + ' Z',
                )
                .join(' ')}
            />
          </svg>
          <p>
            {text.size} {formatNumber(geometry.profile.width)} ×{' '}
            {formatNumber(geometry.profile.depth)} mm
          </p>
        </>
      )}
      <p role="status" aria-label={text.status}>
        {busy
          ? text.loading
          : editorMode === 'draw' && !sourceMode
            ? text.sketchPending
            : draftDirty
              ? editorMode === 'boolean'
                ? text.booleanPending
                : text.editPending
              : geometry
                ? text.valid
                : sourceMode
                  ? text.traceInvalid
                  : text.invalid}
      </p>
      <p className="hint">{text.limits}</p>
      <button
        type="button"
        className="btn"
        disabled={!geometry}
        onClick={() => {
          if (!geometry) return;
          const result = toBinaryStl(geometry.mesh, 'orthogonal-cutter');
          if (!result.ok || !result.bytes) {
            setError(text.exportError);
            return;
          }
          onExport(
            exportName(
              'orthogonal-cutter',
              'ring',
              `W${geometry.profile.width}-D${geometry.profile.depth}-H${heightMm}mm`,
              'stl',
            ),
            result.bytes,
          );
        }}
      >
        {text.download}
      </button>
      <button
        type="button"
        className="btn"
        disabled={!geometry}
        onClick={() => {
          if (!geometry) return;
          const result = toOrthogonalCutterSvg(geometry.profile.points);
          if (!result.ok || !result.bytes) {
            setError(text.exportError);
            return;
          }
          onExport(result.filename, result.bytes);
        }}
      >
        {text.svgSave}
      </button>
      <button
        type="button"
        className="btn"
        disabled={!geometry}
        onClick={() => {
          if (!geometry) return;
          try {
            const bytes = writeOrthogonalCutterFile({
              format: 'patturn-orthogonal-cutter',
              version: 1,
              units: 'mm',
              heightMm,
              wallMm,
              tipMm,
              points: geometry.profile.points,
            });
            onExport('patturn-orthogonal-cutter.orthogonal.json', bytes);
          } catch {
            setError(text.fileError);
          }
        }}
      >
        {text.fileSave}
      </button>
      <p className="hint">{sourceMode ? text.traceFileHelp : text.fileHelp}</p>
      {sourceMode && onCopy && (
        <button
          type="button"
          className="btn"
          disabled={!geometry}
          onClick={() => {
            if (!geometry || sourceContours === undefined) return;
            try {
              onCopy(snapshotTracedOrthogonalCutter(sourceContours, { heightMm, wallMm, tipMm }));
              setError('');
            } catch {
              setError(text.traceCopyError);
            }
          }}
        >
          {text.traceCopy}
        </button>
      )}

      {error && <p role="alert">{error}</p>}
    </div>
  );
}

/** Copies are explicit and detached; changing source identity synchronously hides the old copy. */
export function TracedOrthogonalCutterTool({
  sourceContours,
  onExport,
}: {
  sourceContours: readonly (readonly CutterPoint[])[];
  onExport: (name: string, bytes: Uint8Array) => void;
}) {
  const [copy, setCopy] = useState<{
    source: typeof sourceContours;
    file: OrthogonalCutterFile;
    id: number;
  } | null>(null);
  const serial = useRef(0);
  useEffect(() => {
    // Also release the snapshot so restoring an older source object cannot resurrect it.
    setCopy((current) => (current?.source === sourceContours ? current : null));
  }, [sourceContours]);
  return (
    <>
      <OrthogonalCutterTool
        sourceContours={sourceContours}
        onExport={onExport}
        onCopy={(file) => setCopy({ source: sourceContours, file, id: ++serial.current })}
      />
      {copy?.source === sourceContours && (
        <section className="orthogonal-trace-copy" aria-label={text.traceCopyScope}>
          <h3>{text.traceCopyScope}</h3>
          <p className="hint">{text.traceCopyHelp}</p>
          <button type="button" className="btn" onClick={() => setCopy(null)}>
            {text.traceCopyDiscard}
          </button>
          <OrthogonalCutterTool key={copy.id} initialFile={copy.file} onExport={onExport} />
        </section>
      )}
    </>
  );
}
