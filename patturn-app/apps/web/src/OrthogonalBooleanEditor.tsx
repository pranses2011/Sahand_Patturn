import { useState } from 'react';
import type { CutterPoint, ConvexCutterOptions } from '@patturn/kernel';
import type { RectangleBooleanOperation } from '@patturn/patterns';
import { editOrthogonalRectangle } from './orthogonal-boolean';
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
      <button
        type="button"
        className="btn"
        onClick={() => {
          try {
            if (values.some((v) => !v.trim())) throw Error('EMPTY');
            const [x, y, width, height] = values.map(Number);
            onApply(
              editOrthogonalRectangle(
                points,
                { x: x!, y: y!, width: width!, height: height! },
                operation,
                options,
              ),
            );
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
