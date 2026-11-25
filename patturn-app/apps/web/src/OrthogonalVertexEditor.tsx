import { useState } from 'react';
import type { CutterPoint, ConvexCutterOptions } from '@patturn/kernel';
import { moveOrthogonalVertex } from './orthogonal-vertex';
import { orthogonalCutter as text } from './messages/fa.json';
import { formatNumber } from './number-format';
export function OrthogonalVertexEditor({
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
  const [selected, setSelected] = useState(0),
    [dirty, setDirty] = useState(false);
  return (
    <fieldset>
      <legend>{text.editLegend}</legend>
      <p className="hint">{text.editHelp}</p>
      <label>
        {text.selectVertex}
        <select
          aria-label={text.selectVertex}
          disabled={dirty}
          value={selected}
          onChange={(event) => setSelected(Number(event.currentTarget.value))}
        >
          {points.map((p, i) => (
            <option key={i} value={i}>
              {text.vertex} {formatNumber(i + 1)}: {formatNumber(p[0])}، {formatNumber(p[1])} mm
            </option>
          ))}
        </select>
      </label>
      <VertexFields
        key={selected}
        points={points}
        index={selected}
        options={options}
        onDirty={() => {
          setDirty(true);
          onDirty();
        }}
        onApply={(next) => {
          setDirty(false);
          onApply(next);
        }}
        onCancel={() => {
          setDirty(false);
          onCancel();
        }}
      />
    </fieldset>
  );
}
function VertexFields({
  points,
  index,
  options,
  onDirty,
  onApply,
  onCancel,
}: {
  points: readonly CutterPoint[];
  index: number;
  options: ConvexCutterOptions;
  onDirty: () => void;
  onApply: (points: CutterPoint[]) => void;
  onCancel: () => void;
}) {
  const point = points[index]!;
  const [x, setX] = useState(String(point[0])),
    [y, setY] = useState(String(point[1])),
    [error, setError] = useState('');
  return (
    <>
      <label>
        {text.vertexX}
        <input
          type="number"
          step="any"
          min={-1000}
          max={1000}
          value={x}
          onChange={(event) => {
            setX(event.currentTarget.value);
            setError('');
            onDirty();
          }}
        />
      </label>
      <label>
        {text.vertexY}
        <input
          type="number"
          step="any"
          min={-1000}
          max={1000}
          value={y}
          onChange={(event) => {
            setY(event.currentTarget.value);
            setError('');
            onDirty();
          }}
        />
      </label>
      <button
        type="button"
        className="btn"
        onClick={() => {
          try {
            if (!x.trim() || !y.trim()) throw Error('EMPTY_COORDINATE');
            const next = moveOrthogonalVertex(points, index, Number(x), Number(y), options);
            setError('');
            onApply(next);
          } catch {
            setError(text.editError);
            onDirty();
          }
        }}
      >
        {text.applyVertex}
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          setX(String(point[0]));
          setY(String(point[1]));
          setError('');
          onCancel();
        }}
      >
        {text.cancelVertex}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
