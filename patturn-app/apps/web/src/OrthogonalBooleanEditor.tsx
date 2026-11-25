import { useState, useMemo, useId } from 'react';
import type { CutterPoint, ConvexCutterOptions } from '@patturn/kernel';
import type { RectangleBooleanOperation } from '@patturn/patterns';
import {
  editOrthogonalRectangle,
  parseBooleanRectangle,
  previewOrthogonalRectangle,
} from './orthogonal-boolean';
import { formatNumber } from './number-format';
import { orthogonalCutter as text } from './messages/fa.json';
export function OrthogonalBooleanEditor({
  points,
  options,
  onDirty,
  onApply,
  onCancel,
}: {
  points: readonly CutterPoint[];
  options: ConvexCutterOptions;
  onDirty: () => void;
  onApply: (points: CutterPoint[]) => void;
  onCancel: () => void;
}) {
  const [operation, setOperation] = useState<RectangleBooleanOperation>('difference');
  const [values, setValues] = useState(['20', '-20', '20', '40']);
  const [error, setError] = useState('');
  const description = useId();
  const preview = useMemo(
    () => previewOrthogonalRectangle(points, values, operation, options),
    [points, values, operation, options],
  );
  return (
    <fieldset>
      <legend>{text.booleanLegend}</legend>
      <p className="hint">{text.booleanHelp}</p>
      <label>
        {text.booleanOperation}
        <select
          aria-label={text.booleanOperation}
          value={operation}
          onChange={(event) => {
            setOperation(event.currentTarget.value as RectangleBooleanOperation);
            setError('');
            onDirty();
          }}
        >
          <option value="difference">{text.booleanDifference}</option>
          <option value="union">{text.booleanUnion}</option>
          <option value="intersection">{text.booleanIntersection}</option>
        </select>
      </label>
      {[text.booleanX, text.booleanY, text.booleanWidth, text.booleanHeight].map((label, i) => (
        <label key={label}>
          {label}
          <input
            type="number"
            step="any"
            min={i < 2 ? -1000 : 0}
            max={i < 2 ? 1000 : 150}
            value={values[i]}
            onChange={(event) => {
              setValues(values.map((v, j) => (j === i ? event.currentTarget.value : v)));
              setError('');
              onDirty();
            }}
          />
        </label>
      ))}
      <p id={description} className="hint">
        {text.booleanPreviewHelp}
      </p>
      <svg
        role="img"
        aria-label={text.booleanPreview}
        aria-describedby={description}
        viewBox={`${preview.box.x} ${preview.box.y} ${preview.box.width} ${preview.box.height}`}
        style={{
          width: '100%',
          aspectRatio: `${preview.box.width}/${preview.box.height}`,
          maxHeight: '360px',
        }}
      >
        <polygon
          data-layer="source"
          points={points.map((p) => p.join(',')).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {preview.rectangle && (
          <rect
            data-layer="operand"
            x={preview.rectangle.x}
            y={preview.rectangle.y}
            width={preview.rectangle.width}
            height={preview.rectangle.height}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="6 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          data-layer="candidate"
          data-valid={preview.valid}
          data-contours={preview.contours.length}
          d={preview.contours
            .map((ring) => ring.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ') + ' Z')
            .join(' ')}
          fill={preview.valid ? '#176b78' : 'none'}
          fillOpacity="0.2"
          fillRule="evenodd"
          stroke="#176b78"
          strokeWidth="2"
          strokeDasharray={preview.valid ? undefined : '2 3'}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <p role="status" aria-label={text.booleanPreviewStatus}>
        {preview.valid ? text.booleanPreviewValid : text.booleanPreviewInvalid}{' '}
        {text.booleanPreviewRings}: {formatNumber(preview.contours.length)}
      </p>
      <button
        type="button"
        className="btn"
        onClick={() => {
          try {
            const rectangle = parseBooleanRectangle(values);
            onApply(editOrthogonalRectangle(points, rectangle, operation, options));
            setError('');
          } catch {
            setError(text.booleanError);
            onDirty();
          }
        }}
      >
        {text.booleanApply}
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          setValues(['20', '-20', '20', '40']);
          setOperation('difference');
          setError('');
          onCancel();
        }}
      >
        {text.booleanCancel}
      </button>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
