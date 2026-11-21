import { exportName, type ExportResult } from './index.js';

type Point = [number, number];
/** Strict linear SVG subset. Curves are rejected, never silently flattened or dropped. */
function polylines(d: string): { points: Point[]; closed: boolean }[] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? [];
  if (d.replace(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g, '').replace(/[\s,]/g, '')) throw Error('DXF_INVALID_PATH');
  let i = 0, command = '', x = 0, y = 0;
  let points: Point[] = [];
  const out: { points: Point[]; closed: boolean }[] = [];
  const flush = (closed = false) => {
    if (points.length < 2) throw Error('DXF_DEGENERATE_SUBPATH');
    out.push({ points, closed }); points = [];
  };
  const number = () => {
    const token = tokens[i++];
    if (token === undefined || /^[a-zA-Z]$/.test(token) || !Number.isFinite(Number(token))) throw Error('DXF_INVALID_NUMBER');
    return Number(token);
  };
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i]!)) command = tokens[i++]!;
    if (!/^[MmLlHhVvZz]$/.test(command)) throw Error('DXF_UNSUPPORTED_COMMAND');
    const op = command.toUpperCase(), relative = command !== op;
    if (op === 'Z') {
      if (!points.length) throw Error('DXF_INVALID_CLOSE');
      [x, y] = points[0]!; flush(true); command = ''; continue;
    }
    if (op !== 'M' && !points.length) throw Error('DXF_MISSING_MOVE');
    if (op === 'M' || op === 'L') {
      const a = number(), b = number();
      x = a + (relative ? x : 0); y = b + (relative ? y : 0);
      if (op === 'M') { if (points.length) flush(); command = relative ? 'l' : 'L'; }
    } else if (op === 'H') x = number() + (relative ? x : 0);
    else y = number() + (relative ? y : 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw Error('DXF_INVALID_NUMBER');
    points.push([x, y]);
  }
  if (points.length) flush();
  if (!out.length) throw Error('DXF_EMPTY_PATH');
  return out;
}

/** R12 linear geometry only, model coordinates in mm, outline/detail layers. */
export function toDxf(paths: { d: string; fill?: boolean }[]): ExportResult {
  const filename = exportName('pattern', 'flat', 'mm', 'dxf');
  try {
    if (!paths.length) throw Error('DXF_EMPTY_DRAWING');
    // Parse everything first so unsupported geometry cannot yield a partial successful file.
    const parsed = paths.map((p) => ({ layer: p.fill ? 'outline' : 'detail', lines: polylines(p.d) }));
    const lines: string[] = [];
    const push = (...values: (string | number)[]) => lines.push(...values.map(String));
    push(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$MEASUREMENT', 70, 1, 0, 'ENDSEC');
    push(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, 2);
    for (const [name, color] of [['outline', 7], ['detail', 1]] as const)
      push(0, 'LAYER', 2, name, 70, 0, 62, color, 6, 'CONTINUOUS');
    push(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
    for (const p of parsed) for (const line of p.lines) {
      push(0, 'POLYLINE', 8, p.layer, 66, 1, 70, line.closed ? 1 : 0, 10, 0, 20, 0, 30, 0);
      for (const [x, y] of line.points) push(0, 'VERTEX', 8, p.layer, 10, x, 20, y, 30, 0);
      push(0, 'SEQEND', 8, p.layer);
    }
    push(0, 'ENDSEC', 0, 'EOF');
    return { ok: true, filename, bytes: new TextEncoder().encode(lines.join('\n') + '\n') };
  } catch (e) { return { ok: false, filename, error: e instanceof Error ? e.message : 'DXF_INVALID_PATH' }; }
}
