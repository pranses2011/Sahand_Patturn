import { useId, useRef, useState } from 'react';
import { convexCutterProfile, type CutterPoint } from '@patturn/kernel';
import { cutterSketchPoint } from './cutter-sketch';
import { cookieSketch as text } from './messages/fa.json';
import { formatNumber } from './number-format';
export function CutterSketch({ onChange }: { onChange: (points: CutterPoint[] | null) => void }) {
  const [points, setPoints] = useState<CutterPoint[]>([]),
    [cursor, setCursor] = useState<[number, number]>([30, 30]);
  const [closed, setClosed] = useState(false),
    [error, setError] = useState('');
  const canvas = useRef<SVGSVGElement>(null);
  const help = useId();
  const invalidate = () => {
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
    setPoints([...points, [point[0], point[1]]]);
  };
  const undo = () => {
    invalidate();
    setPoints(points.slice(0, -1));
  };
  return (
    <div className="cutter-sketch">
      <p id={help} className="hint">
        {text.help}
      </p>
      <svg
        ref={canvas}
        viewBox="0 0 160 160"
        preserveAspectRatio="none"
        role="img"
        tabIndex={0}
        aria-label={text.canvas}
        aria-describedby={help}
        style={{ width: '100%', aspectRatio: '1', background: '#fff', touchAction: 'manipulation' }}
        onClick={(event) => {
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
            add(cursor);
          } else if (event.key === 'Backspace') {
            event.preventDefault();
            undo();
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
          <circle key={i} cx={p[0] + 5} cy={p[1] + 5} r="1" fill="#1c1917" />
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
      <button
        type="button"
        className="btn"
        disabled={points.length < 3}
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
      <button type="button" className="btn" disabled={!points.length} onClick={undo}>
        {text.undo}
      </button>{' '}
      <button
        type="button"
        className="btn"
        disabled={!points.length}
        onClick={() => {
          invalidate();
          setPoints([]);
        }}
      >
        {text.clear}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
