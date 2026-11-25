import { useId, useState } from 'react';
import type { ConvexCutterOptions, CutterPoint } from '@patturn/kernel';
import { appendOrthogonalSketchPoint, closeOrthogonalSketch } from './orthogonal-sketch';
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
      <svg role="img" aria-label={text.sketchPreview} viewBox="-5 -5 160 160">
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
