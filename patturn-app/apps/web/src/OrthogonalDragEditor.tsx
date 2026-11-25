import { useId, useMemo, useRef, useState } from 'react';
import type { CutterPoint, ConvexCutterOptions } from '@patturn/kernel';
import { moveOrthogonalVertex } from './orthogonal-vertex';
import { orthogonalDragBox, orthogonalDragHit, orthogonalDragPoint } from './orthogonal-drag';
import { orthogonalCutter as text } from './messages/fa.json';
export function OrthogonalDragEditor({
  points,
  options,
  onDirty,
  onApply,
  onCancel,
  onActiveChange,
}: {
  points: readonly CutterPoint[];
  options: ConvexCutterOptions;
  onDirty: () => void;
  onApply: (points: CutterPoint[]) => void;
  onCancel: () => void;
  onActiveChange: (active: boolean) => void;
}) {
  const help = useId();
  const box = useMemo(() => orthogonalDragBox(points), [points]);
  const [preview, setPreview] = useState(points),
    [error, setError] = useState(false),
    [invalid, setInvalid] = useState(false);
  const canvas = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    id: number;
    index: number;
    candidate: CutterPoint[] | null;
    invalid: boolean;
  } | null>(null);
  const cancel = () => {
    const active = drag.current;
    drag.current = null;
    setPreview(points);
    setError(false);
    setInvalid(false);
    onCancel();
    onActiveChange(false);
    if (active && canvas.current?.hasPointerCapture(active.id))
      canvas.current.releasePointerCapture(active.id);
  };
  return (
    <fieldset className="orthogonal-drag-editor">
      <legend>{text.dragLegend}</legend>
      <p id={help} className="hint">
        {text.dragHelp}
      </p>
      <svg
        ref={canvas}
        role="img"
        aria-label={text.dragCanvas}
        aria-describedby={help}
        tabIndex={0}
        viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
        preserveAspectRatio="none"
        style={{
          width: '100%',
          aspectRatio: `${box.width}/${box.height}`,
          background: '#fff',
          touchAction: 'none',
        }}
        onPointerDown={(event) => {
          if (drag.current || !event.isPrimary || event.button !== 0) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const index = orthogonalDragHit(
            points,
            event.clientX - rect.left,
            event.clientY - rect.top,
            rect.width,
            rect.height,
            box,
          );
          if (index === null) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.focus();
          drag.current = { id: event.pointerId, index, candidate: null, invalid: false };
          setError(false);
          setInvalid(false);
          onDirty();
          onActiveChange(true);
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (!active || active.id !== event.pointerId) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const point = orthogonalDragPoint(
            event.clientX - rect.left,
            event.clientY - rect.top,
            rect.width,
            rect.height,
            box,
          );
          try {
            const next = moveOrthogonalVertex(points, active.index, point[0], point[1], options);
            active.candidate = next;
            active.invalid = false;
            setInvalid(false);
            setPreview(next);
          } catch {
            active.invalid = true;
            setInvalid(true);
          }
        }}
        onPointerUp={(event) => {
          const active = drag.current;
          if (!active || active.id !== event.pointerId) return;
          // Pointer-up can carry a newer position than the last delivered move event.
          if (active.candidate || active.invalid) {
            try {
              const rect = event.currentTarget.getBoundingClientRect();
              const point = orthogonalDragPoint(
                event.clientX - rect.left,
                event.clientY - rect.top,
                rect.width,
                rect.height,
                box,
              );
              active.candidate = moveOrthogonalVertex(
                points,
                active.index,
                point[0],
                point[1],
                options,
              );
              active.invalid = false;
            } catch {
              active.invalid = true;
            }
          }
          drag.current = null;
          onActiveChange(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          if (active.invalid) {
            setPreview(points);
            setError(true);
            setInvalid(true);
            onDirty();
          } else if (active.candidate) onApply(active.candidate);
          else cancel();
        }}
        onPointerCancel={(event) => {
          if (drag.current?.id === event.pointerId) cancel();
        }}
        onLostPointerCapture={(event) => {
          if (drag.current?.id === event.pointerId) cancel();
        }}
        onKeyDown={(event) => {
          if (drag.current) {
            event.preventDefault();
            event.stopPropagation();
            if (event.key === 'Escape') cancel();
          }
        }}
      >
        <path
          d={preview.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ') + ' Z'}
          fill="none"
          stroke={invalid ? '#a12b25' : '#1c1917'}
          strokeWidth="0.8"
        />
        {preview.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r="2" fill="#a94f21" />
        ))}
      </svg>
      <button type="button" className="btn" onClick={cancel}>
        {text.dragCancel}
      </button>
      {error && <p role="alert">{text.dragError}</p>}
    </fieldset>
  );
}
