import { useState, useEffect, useRef, useMemo, useId } from 'react';
import type { CutterPoint, ConvexCutterOptions } from '@patturn/kernel';
import { booleanOrthogonalPolygons, type RectangleBooleanOperation } from '@patturn/patterns';
import { cutterSvgPoints } from './cutter-svg';
import { openOrthogonalContour } from './orthogonal-vertex';
import {
  editOrthogonalPolygon,
  previewOrthogonalPolygon,
  translateBooleanOperand,
} from './orthogonal-boolean';
import text from 'virtual:patturn-messages/orthogonalCutter';
import { formatNumber } from './number-format';
export function OrthogonalPolygonBooleanEditor({
  points,
  options,
  onDirty,
  onApply,
  onCancel,
}: {
  points: readonly CutterPoint[];
  options: ConvexCutterOptions;
  onDirty: () => void;
  onApply: (p: CutterPoint[]) => void;
  onCancel: () => void;
}) {
  const [operand, setOperand] = useState<CutterPoint[] | null>(null),
    [offsets, setOffsets] = useState(['0', '0']),
    [operation, setOperation] = useState<RectangleBooleanOperation>('difference'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const request = useRef(0),
    alive = useRef(true),
    description = useId();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current++;
    };
  }, []);
  const preview = useMemo(
    () => previewOrthogonalPolygon(points, operand, offsets, operation, options),
    [points, operand, offsets, operation, options],
  );
  const cancel = () => {
    request.current++;
    setOperand(null);
    setBusy(false);
    setError('');
    setOffsets(['0', '0']);
    onCancel();
  };
  return (
    <fieldset>
      <legend>{text.polygonBooleanLegend}</legend>
      <p id={description} className="hint">
        {text.polygonBooleanHelp}
      </p>
      <label>
        {text.polygonBooleanInput}
        <input
          type="file"
          accept=".svg,image/svg+xml"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (!file) return;
            const id = ++request.current;
            setBusy(true);
            setError('');
            setOperand(null);
            onDirty();
            void (async () => {
              try {
                if (file.size > 65536) throw Error('SIZE');
                const contour = openOrthogonalContour(cutterSvgPoints(await file.text()));
                booleanOrthogonalPolygons(contour, contour, 'intersection');
                if (alive.current && request.current === id) setOperand(contour);
              } catch {
                if (alive.current && request.current === id)
                  setError(text.polygonBooleanInputError);
              } finally {
                if (alive.current && request.current === id) setBusy(false);
              }
            })();
          }}
        />
      </label>
      <label>
        {text.polygonBooleanOperation}
        <select
          aria-label={text.polygonBooleanOperation}
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
      {[text.polygonBooleanX, text.polygonBooleanY].map((label, i) => (
        <label key={label}>
          {label}
          <input
            type="number"
            min={-1000}
            max={1000}
            step="any"
            value={offsets[i]}
            onChange={(event) => {
              setOffsets(offsets.map((v, j) => (j === i ? event.currentTarget.value : v)));
              setError('');
              onDirty();
            }}
          />
        </label>
      ))}
      <svg
        role="img"
        aria-label={text.polygonBooleanPreview}
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
        {preview.operand && (
          <polygon
            data-layer="operand"
            points={preview.operand.map((p) => p.join(',')).join(' ')}
            fill="none"
            stroke="currentColor"
            strokeDasharray="6 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          data-layer="candidate"
          data-valid={preview.valid}
          data-contours={preview.contours.length}
          d={preview.contours
            .map((r) => r.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ') + ' Z')
            .join(' ')}
          fill={preview.valid ? '#176b78' : 'none'}
          fillOpacity="0.2"
          fillRule="evenodd"
          stroke="#176b78"
          strokeDasharray={preview.valid ? undefined : '2 3'}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <p role="status" aria-label={text.polygonBooleanStatus}>
        {busy
          ? text.loading
          : preview.valid
            ? text.booleanPreviewValid
            : text.booleanPreviewInvalid}{' '}
        {text.booleanPreviewRings}: {formatNumber(preview.contours.length)}
      </p>
      <button
        type="button"
        className="btn"
        disabled={busy || !operand}
        onClick={() => {
          if (busy || !operand) return;
          try {
            const next = editOrthogonalPolygon(
              points,
              translateBooleanOperand(operand, offsets),
              operation,
              options,
            );
            onApply(next);
          } catch {
            setError(text.booleanError);
            onDirty();
          }
        }}
      >
        {text.polygonBooleanApply}
      </button>
      <button type="button" className="btn" onClick={cancel}>
        {text.polygonBooleanCancel}
      </button>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
