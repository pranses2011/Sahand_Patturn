import { cookieCutter as text } from './messages/fa.json';
import { useMemo, useState } from 'react';
import { buildCircularCutter, circularCutterProfile, validateMesh } from '@patturn/kernel';
import { toBinaryStl, exportName } from '@patturn/exporters';
import { NumericControl } from './NumericControl';
import { formatNumber } from './number-format';
export function CookieCutterTool({
  onExport,
}: {
  onExport: (name: string, bytes: Uint8Array) => void;
}) {
  const [diameterMm, setDiameter] = useState(60),
    [heightMm, setHeight] = useState(20),
    [wallMm, setWall] = useState(1.6),
    [tipMm, setTip] = useState(0.6);
  const [error, setError] = useState('');
  const geometry = useMemo(() => {
    try {
      const options = { diameterMm, heightMm, wallMm, tipMm };
      const mesh = buildCircularCutter(options);
      return { ...circularCutterProfile(options), mesh, report: validateMesh(mesh) };
    } catch {
      return null;
    }
  }, [diameterMm, heightMm, wallMm, tipMm]);
  return (
    <>
      <p className="hint">{text.intro}</p>
      {[
        { label: text.diameter, value: diameterMm, set: setDiameter, min: 20, max: 150 },
        { label: text.height, value: heightMm, set: setHeight, min: 10, max: 40 },
        { label: text.wall, value: wallMm, set: setWall, min: 0.8, max: 3 },
        { label: text.tip, value: tipMm, set: setTip, min: 0.4, max: 1.2 },
      ].map((control) => (
        <NumericControl
          key={control.label}
          label={control.label}
          value={control.value}
          step={control.min < 1 ? 0.1 : 1}
          min={control.min}
          max={control.max}
          onChange={(value) => {
            control.set(value);
            setError('');
          }}
          onBeginEdit={() => {}}
          onEndEdit={() => {}}
        />
      ))}
      {geometry && (
        <>
          <svg
            viewBox={`0 -${heightMm + 4} ${diameterMm / 2 + wallMm + 8} ${heightMm + 8}`}
            role="img"
            aria-label={text.preview}
          >
            <path
              d={geometry.rings.map((p, i) => `${i ? 'L' : 'M'}${p.r} ${-p.y}`).join(' ') + ' Z'}
              fill="#3f6c7a"
            />
          </svg>
          <p>
            {text.opening} {formatNumber(geometry.minimumOpeningMm)} {text.geometry}
          </p>
        </>
      )}
      <p role="status" aria-label={text.status}>
        {geometry?.report.ok ? text.valid : text.invalid}
      </p>
      <p className="hint">{text.safety}</p>
      <button
        type="button"
        className="btn"
        disabled={!geometry?.report.ok}
        onClick={() => {
          if (!geometry?.report.ok) return;
          const result = toBinaryStl(geometry.mesh, 'circular-cutter');
          if (!result.ok || !result.bytes) {
            setError(text.exportError);
            return;
          }
          onExport(
            exportName(
              'circular-cutter',
              'ring',
              `D${diameterMm}-H${heightMm}-W${wallMm}-T${tipMm}mm`,
              'stl',
            ),
            result.bytes,
          );
        }}
      >
        {text.download}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
