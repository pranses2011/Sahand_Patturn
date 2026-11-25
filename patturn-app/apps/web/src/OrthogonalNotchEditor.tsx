import { useState } from 'react';
import type { CutterPoint, ConvexCutterOptions } from '@patturn/kernel';
import { addOrthogonalNotch, removeOrthogonalNotch } from './orthogonal-notch';
import { orthogonalCutter as text } from './messages/fa.json';
import { formatNumber } from './number-format';
export function OrthogonalNotchEditor({
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
    [start, setStart] = useState('20'),
    [width, setWidth] = useState('20'),
    [depth, setDepth] = useState('14'),
    [error, setError] = useState('');
  const apply = (remove: boolean) => {
    try {
      if (!remove && [start, width, depth].some((value) => !value.trim()))
        throw Error('EMPTY_NOTCH');
      const next = remove
        ? removeOrthogonalNotch(points, selected, options)
        : addOrthogonalNotch(
            points,
            selected,
            Number(start),
            Number(width),
            Number(depth),
            options,
          );
      setError('');
      onApply(next);
    } catch {
      setError(text.notchError);
      onDirty();
    }
  };
  return (
    <fieldset>
      <legend>{text.notchLegend}</legend>
      <p className="hint">{text.notchHelp}</p>
      <label>
        {text.notchSelect}
        <select
          aria-label={text.notchSelect}
          value={selected}
          onChange={(event) => {
            setSelected(Number(event.currentTarget.value));
            setError('');
          }}
        >
          {points.map((p, i) => (
            <option key={i} value={i}>
              {formatNumber(i + 1)}: {formatNumber(p[0])}، {formatNumber(p[1])} mm
            </option>
          ))}
        </select>
      </label>
      {[
        { label: text.notchStart, value: start, set: setStart },
        { label: text.notchWidth, value: width, set: setWidth },
        { label: text.notchDepth, value: depth, set: setDepth },
      ].map((field) => (
        <label key={field.label}>
          {field.label}
          <input
            type="number"
            min={0}
            max={150}
            step="any"
            value={field.value}
            onChange={(event) => {
              field.set(event.currentTarget.value);
              setError('');
              onDirty();
            }}
          />
        </label>
      ))}
      <button type="button" className="btn" onClick={() => apply(false)}>
        {text.notchAdd}
      </button>
      <button type="button" className="btn" onClick={() => apply(true)}>
        {text.notchRemove}
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          setStart('20');
          setWidth('20');
          setDepth('14');
          setError('');
          onCancel();
        }}
      >
        {text.notchCancel}
      </button>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
