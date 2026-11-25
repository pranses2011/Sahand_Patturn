import { useId, useState } from 'react';
import type { ConvexCutterOptions, CutterPoint } from '@patturn/kernel';
import {
  appendOrthogonalSketchPoint,
  closeOrthogonalSketch,
  orthogonalSketchPointer,
} from './orthogonal-sketch';
import { orthogonalCutter as text } from './messages/fa.json';
import { formatNumber } from './number-format';
export function OrthogonalSketchEditor({
  options,
  onApply,
  onCancel,
}: {
  options: ConvexCutterOptions;
  onApply: (points: CutterPoint[]) => void;
  onCancel: () => void;
}) {
  const [points, setPoints] = useState<CutterPoint[]>([]),
    [x, setX] = useState('0'),
    [y, setY] = useState('0'),
    [error, setError] = useState('');
  const help = useId();
  const addPoint = (px: number, py: number) => {
    try {
      setPoints(appendOrthogonalSketchPoint(points, px, py));
      setError('');
    } catch {
      setError(text.sketchPointError);
    }
  };
  const cursorX = Math.max(0, Math.min(150, Number(x) || 0));
  const cursorY = Math.max(0, Math.min(150, Number(y) || 0));
  return (
    <fieldset>
      <legend>{text.sketchLegend}</legend>
      <p id={help} className="hint">
        {text.sketchHelp}
      </p>
      {[
        { label: text.sketchX, value: x, set: setX },
        { label: text.sketchY, value: y, set: setY },
      ].map((field) => (
        <label key={field.label}>
          {field.label}
          <input
            type="number"
            min={0}
            max={150}
            step="any"
            value={field.value}
            aria-describedby={help}
            onChange={(event) => {
              field.set(event.currentTarget.value);
              setError('');
            }}
          />
        </label>
      ))}
      <button
        className="btn"
        type="button"
        disabled={points.length >= 64}
        onClick={() => {
          try {
            if (!x.trim() || !y.trim()) throw Error('EMPTY');
            setPoints(appendOrthogonalSketchPoint(points, Number(x), Number(y)));
            setError('');
          } catch {
            setError(text.sketchPointError);
          }
        }}
      >
        {text.sketchAdd}
      </button>
      <button
        className="btn"
        type="button"
        disabled={!points.length}
        onClick={() => {
          setPoints(points.slice(0, -1));
          setError('');
        }}
      >
        {text.sketchDelete}
      </button>
      <button
        className="btn"
        type="button"
        disabled={!points.length}
        onClick={() => {
          setPoints([]);
          setError('');
        }}
      >
        {text.sketchClear}
      </button>
      <p role="status" aria-label={text.sketchCount}>
        {formatNumber(points.length)} / {formatNumber(64)}
      </p>
      <p className="hint" id={`${help}-pointer`}>
        {text.sketchPointerHelp}
      </p>
      <svg
        className="orthogonal-sketch-canvas"
        role="group"
        tabIndex={0}
        aria-label={text.sketchPreview}
        aria-describedby={`${help}-pointer`}
        viewBox="-5 -5 160 160"
        preserveAspectRatio="xMidYMid meet"
        onClick={(event) => {
          if (event.button !== 0 || event.detail === 0) return;
          const box = event.currentTarget.getBoundingClientRect();
          try {
            const [px, py] = orthogonalSketchPointer(
              event.clientX - box.left,
              event.clientY - box.top,
              box.width,
              box.height,
            );
            setX(String(px));
            setY(String(py));
            addPoint(px, py);
          } catch {
            setError(text.sketchPointerError);
          }
        }}
        onKeyDown={(event) => {
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            if (!x.trim() || !y.trim()) {
              setError(text.sketchPointError);
              return;
            }
            addPoint(Number(x), Number(y));
            return;
          }
          const steps: Record<string, [number, number]> = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          };
          const step = steps[event.key];
          if (!step) return;
          event.preventDefault();
          event.stopPropagation();
          setX(String(Math.max(0, Math.min(150, cursorX + step[0]))));
          setY(String(Math.max(0, Math.min(150, cursorY + step[1]))));
          setError('');
        }}
      >
        <defs>
          <pattern id={`${help}-grid`} width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.15" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="150" height="150" fill={`url(#${help}-grid)`} />
        <path
          d={`M${cursorX - 2} ${cursorY}h4 M${cursorX} ${cursorY - 2}v4`}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.5"
        />
        <rect
          x="0"
          y="0"
          width="150"
          height="150"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.4"
        />
        <polyline
          points={points.map((p) => p.join(',')).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.8"
        />
        {points.map(([px, py], i) => (
          <circle key={i} cx={px} cy={py} r="1.2" fill="currentColor" />
        ))}
      </svg>
      <p role="status" aria-label={text.sketchCursor}>
        {text.sketchCursor}: {formatNumber(cursorX)}، {formatNumber(cursorY)} mm
      </p>
      <ol aria-label={text.sketchPoints}>
        {points.map(([px, py], i) => (
          <li key={i}>
            {formatNumber(px)}، {formatNumber(py)} mm
          </li>
        ))}
      </ol>
      <button
        className="btn"
        type="button"
        disabled={points.length < 4}
        onClick={() => {
          try {
            onApply(closeOrthogonalSketch(points, options));
          } catch {
            setError(text.sketchCloseError);
          }
        }}
      >
        {text.sketchApply}
      </button>
      <button className="btn" type="button" onClick={onCancel}>
        {text.sketchCancel}
      </button>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
