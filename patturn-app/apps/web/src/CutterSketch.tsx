import { historyShortcut } from './history-shortcut';
import { initialSketchHistory, sketchHistory } from './sketch-history';
import { useId, useReducer, useRef, useState } from 'react';
import { convexCutterProfile, type CutterPoint } from '@patturn/kernel';
import { cutterSketchHit, cutterSketchPoint } from './cutter-sketch';
import text from 'virtual:patturn-messages/cookieSketch';
import { formatNumber } from './number-format';
export function CutterSketch({
  onChange,
  initialPoints = [],
}: {
  onChange: (points: CutterPoint[] | null) => void;
  initialPoints?: readonly CutterPoint[];
}) {
  const [history, dispatch] = useReducer(sketchHistory, initialPoints, initialSketchHistory);
  const points = history.points;
  const [cursor, setCursor] = useState<[number, number]>([30, 30]);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [draftDirty, setDraftDirty] = useState(false);
  const [selected, setSelected] = useState(0);
  const selectedIndex = Math.min(selected, Math.max(0, points.length - 1));
  const [closed, setClosed] = useState(false),
    [error, setError] = useState('');
  const canvas = useRef<SVGSVGElement>(null);
  const help = useId();
  const [moveMode, setMoveMode] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointerId: number; index: number; before: CutterPoint[] } | null>(null);
  const cancelDrag = () => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    dispatch({ type: 'cancel', points: active.before });
    setDragging(false);
    if (canvas.current?.hasPointerCapture(active.pointerId))
      canvas.current.releasePointerCapture(active.pointerId);
  };
  const invalidate = () => {
    setEditorEpoch((value) => value + 1);
    setDraftDirty(false);
    setClosed(false);
    setError('');
    onChange(null);
  };
  const add = (point: CutterPoint) => {
    invalidate();
    if (points.length >= 64) {
      setError(text.limit);
      return;
    }
    setSelected(points.length);
    dispatch({ type: 'edit', points: [...points, [point[0], point[1]]] });
  };
  const undo = () => {
    invalidate();
    dispatch({ type: 'edit', points: points.slice(0, -1) });
  };
  return (
    <div className="cutter-sketch">
      <p id={help} className="hint">
        {text.help}
      </p>
      <button
        type="button"
        className="btn"
        aria-pressed={moveMode}
        disabled={dragging}
        onClick={() => setMoveMode((value) => !value)}
      >
        {text.moveMode}
      </button>
      <p className="hint">{text.moveHelp}</p>
      <p className="hint">{text.historyHelp}</p>
      <button
        type="button"
        className="btn"
        disabled={dragging || !history.past.length}
        onClick={() => {
          invalidate();
          dispatch({ type: 'undo' });
        }}
      >
        {text.historyUndo}
      </button>
      <button
        type="button"
        className="btn"
        disabled={dragging || !history.future.length}
        onClick={() => {
          invalidate();
          dispatch({ type: 'redo' });
        }}
      >
        {text.historyRedo}
      </button>
      <svg
        ref={canvas}
        viewBox="0 0 160 160"
        preserveAspectRatio="none"
        role="img"
        tabIndex={0}
        aria-label={text.canvas}
        aria-describedby={help}
        style={{
          width: '100%',
          aspectRatio: '1',
          background: '#fff',
          touchAction: moveMode ? 'none' : 'manipulation',
        }}
        onPointerDown={(event) => {
          if (!moveMode || drag.current || !event.isPrimary || event.button !== 0) return;
          const box = event.currentTarget.getBoundingClientRect();
          const index = cutterSketchHit(
            points,
            event.clientX - box.left,
            event.clientY - box.top,
            box.width,
            box.height,
          );
          if (index === null) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { pointerId: event.pointerId, index, before: points };
          invalidate();
          setSelected(index);
          setDragging(true);
          event.currentTarget.focus();
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (!active || active.pointerId !== event.pointerId) return;
          const box = event.currentTarget.getBoundingClientRect();
          const point = cutterSketchPoint(
            event.clientX - box.left,
            event.clientY - box.top,
            box.width,
            box.height,
          );
          setCursor(point);
          dispatch({
            type: 'preview',
            points: active.before.map((previous, index) =>
              index === active.index ? point : previous,
            ),
          });
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return;
          dispatch({ type: 'complete', before: drag.current.before });
          drag.current = null;
          setDragging(false);
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          if (drag.current?.pointerId === event.pointerId) cancelDrag();
        }}
        onLostPointerCapture={(event) => {
          if (drag.current?.pointerId === event.pointerId) cancelDrag();
        }}
        onClick={(event) => {
          if (moveMode) return;
          const box = event.currentTarget.getBoundingClientRect();
          const point = cutterSketchPoint(
            event.clientX - box.left,
            event.clientY - box.top,
            box.width,
            box.height,
          );
          setCursor(point);
          add(point);
          canvas.current?.focus();
        }}
        onKeyDown={(event) => {
          if (drag.current) {
            event.preventDefault();
            if (event.key === 'Escape') cancelDrag();
            return;
          }
          const direction = historyShortcut(event.nativeEvent);
          if (direction) {
            event.preventDefault();
            event.stopPropagation();
            invalidate();
            dispatch({ type: direction });
            return;
          }
          const step = event.shiftKey ? 10 : 1;
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault();
            setCursor(([x, y]) => [
              Math.max(
                0,
                Math.min(
                  150,
                  x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
                ),
              ),
              Math.max(
                0,
                Math.min(
                  150,
                  y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0),
                ),
              ),
            ]);
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!moveMode) add(cursor);
          } else if (event.key === 'Backspace') {
            event.preventDefault();
            if (!moveMode) undo();
          }
        }}
      >
        {Array.from({ length: 16 }, (_, i) => (
          <path
            key={i}
            d={`M${i * 10 + 5} 5V155M5 ${i * 10 + 5}H155`}
            fill="none"
            stroke="#d8c9bc"
            strokeWidth="0.3"
          />
        ))}
        <path
          d={
            points.map((p, i) => `${i ? 'L' : 'M'}${p[0] + 5} ${p[1] + 5}`).join(' ') +
            (closed ? ' Z' : '')
          }
          fill={closed ? '#c7d8dc' : 'none'}
          stroke="#1c1917"
          strokeWidth="0.8"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p[0] + 5}
            cy={p[1] + 5}
            r={moveMode ? 2 : 1}
            fill={moveMode && i === selectedIndex ? '#a94f21' : '#1c1917'}
          />
        ))}
        <path
          d={`M${cursor[0] + 2} ${cursor[1] + 5}h6M${cursor[0] + 5} ${cursor[1] + 2}v6`}
          stroke="#a94f21"
          strokeWidth="0.8"
        />
      </svg>
      <p role="status" aria-label={text.status}>
        {text.points} {formatNumber(points.length)}؛ {text.cursor} {formatNumber(cursor[0])}،{' '}
        {formatNumber(cursor[1])} mm؛ {closed ? text.closed : text.open}
      </p>
      {points.length > 0 && (
        <fieldset disabled={dragging}>
          <legend>{text.editLegend}</legend>
          <label>
            {text.selectVertex}
            <select
              aria-label={text.selectVertex}
              value={selectedIndex}
              onChange={(event) => {
                setSelected(Number(event.currentTarget.value));
                setDraftDirty(false);
              }}
            >
              {points.map((point, index) => (
                <option key={index} value={index}>
                  {text.vertex} {formatNumber(index + 1)}: {formatNumber(point[0])}،{' '}
                  {formatNumber(point[1])} mm
                </option>
              ))}
            </select>
          </label>
          <CutterVertexEditor
            key={`${editorEpoch}:${selectedIndex}:${points[selectedIndex]!.join(',')}`}
            point={points[selectedIndex]!}
            onDirty={() => {
              setClosed(false);
              setError('');
              onChange(null);
              setDraftDirty(true);
            }}
            onApply={(point) => {
              invalidate();
              dispatch({
                type: 'edit',
                points: points.map((previous, index) =>
                  index === selectedIndex ? point : previous,
                ),
              });
            }}
          />
          <button
            type="button"
            className="btn"
            onClick={() => {
              invalidate();
              dispatch({
                type: 'edit',
                points: points.filter((_, index) => index !== selectedIndex),
              });
            }}
          >
            {text.deleteSelected}
          </button>
        </fieldset>
      )}
      <button
        type="button"
        className="btn"
        disabled={points.length < 3 || draftDirty || dragging}
        onClick={() => {
          try {
            convexCutterProfile(points, { heightMm: 20, wallMm: 1.6, tipMm: 0.6 });
            setClosed(true);
            setError('');
            onChange(points.map((p) => [p[0], p[1]]));
          } catch {
            setClosed(false);
            setError(text.invalid);
            onChange(null);
          }
        }}
      >
        {text.finish}
      </button>{' '}
      <button type="button" className="btn" disabled={!points.length || dragging} onClick={undo}>
        {text.undo}
      </button>{' '}
      <button
        type="button"
        className="btn"
        disabled={!points.length || dragging}
        onClick={() => {
          invalidate();
          dispatch({ type: 'edit', points: [] });
        }}
      >
        {text.clear}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function CutterVertexEditor({
  point,
  onDirty,
  onApply,
}: {
  point: CutterPoint;
  onDirty: () => void;
  onApply: (point: CutterPoint) => void;
}) {
  const [x, setX] = useState(String(point[0])),
    [y, setY] = useState(String(point[1]));
  const [error, setError] = useState(false);
  const id = useId();
  return (
    <>
      <p id={id} className="hint">
        {text.editHelp}
      </p>
      <label>
        {text.vertexX}
        <input
          type="number"
          min={0}
          max={150}
          step="any"
          value={x}
          aria-describedby={id}
          onChange={(event) => {
            setX(event.currentTarget.value);
            setError(false);
            onDirty();
          }}
        />
      </label>
      <label>
        {text.vertexY}
        <input
          type="number"
          min={0}
          max={150}
          step="any"
          value={y}
          aria-describedby={id}
          onChange={(event) => {
            setY(event.currentTarget.value);
            setError(false);
            onDirty();
          }}
        />
      </label>
      <button
        type="button"
        className="btn"
        onClick={() => {
          const values = [Number(x), Number(y)];
          if (
            !x.trim() ||
            !y.trim() ||
            values.some((n) => !Number.isFinite(n) || n < 0 || n > 150)
          ) {
            setError(true);
            onDirty();
            return;
          }
          setError(false);
          onApply([values[0]!, values[1]!]);
        }}
      >
        {text.applyVertex}
      </button>
      {error && <p role="alert">{text.invalidVertex}</p>}
    </>
  );
}
