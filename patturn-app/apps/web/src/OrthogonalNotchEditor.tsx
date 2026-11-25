import { useState } from 'react';
import type { CutterPoint, ConvexCutterOptions } from '@patturn/kernel';
import {
  addOrthogonalNotch,
  removeOrthogonalNotch,
  addOrthogonalTab,
  removeOrthogonalTab,
} from './orthogonal-notch';
import { orthogonalCutter as text } from './messages/fa.json';
import { formatNumber } from './number-format';
export function OrthogonalNotchEditor({
  points,
  outward,
  onDirectionChange,
  options,
  onDirty,
  onApply,
  onCancel,
}: {
  points: readonly CutterPoint[];
  outward: boolean;
  onDirectionChange: (outward: boolean) => void;
  options: ConvexCutterOptions;
  onDirty: () => void;
  onApply: (points: CutterPoint[]) => void;
  onCancel: () => void;
}) {
  const labels = outward
    ? {
        legend: text.tabLegend,
        help: text.tabHelp,
        select: text.tabSelect,
        start: text.tabStart,
        width: text.tabWidth,
        depth: text.tabDepth,
        add: text.tabAdd,
        remove: text.tabRemove,
        cancel: text.tabCancel,
        error: text.tabError,
      }
    : {
        legend: text.notchLegend,
        help: text.notchHelp,
        select: text.notchSelect,
        start: text.notchStart,
        width: text.notchWidth,
        depth: text.notchDepth,
        add: text.notchAdd,
        remove: text.notchRemove,
        cancel: text.notchCancel,
        error: text.notchError,
      };
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
        ? (outward ? removeOrthogonalTab : removeOrthogonalNotch)(points, selected, options)
        : (outward ? addOrthogonalTab : addOrthogonalNotch)(
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
      setError(labels.error);
      onDirty();
    }
  };
  return (
    <fieldset>
      <legend>{labels.legend}</legend>
      <label>
        {text.rectangleDirection}
        <select
          aria-label={text.rectangleDirection}
          value={outward ? 'outward' : 'inward'}
          onChange={(event) => {
            onDirectionChange(event.currentTarget.value === 'outward');
            setSelected(0);
            setStart('20');
            setWidth('20');
            setDepth('14');
            setError('');
            onCancel();
          }}
        >
          <option value="inward">{text.rectangleInward}</option>
          <option value="outward">{text.rectangleOutward}</option>
        </select>
      </label>
      <p className="hint">{labels.help}</p>
      <label>
        {labels.select}
        <select
          aria-label={labels.select}
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
        { label: labels.start, value: start, set: setStart },
        { label: labels.width, value: width, set: setWidth },
        { label: labels.depth, value: depth, set: setDepth },
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
        {labels.add}
      </button>
      <button type="button" className="btn" onClick={() => apply(true)}>
        {labels.remove}
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
        {labels.cancel}
      </button>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
