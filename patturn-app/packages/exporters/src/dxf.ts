import { clipLine, clipCircle, type DxfBounds } from './dxf-clip.js';
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

/** Recognize only the complete two-semicircle encoding emitted by circle().
 * Equal radii, opposite diameters and both arc flags are checked before conversion.
 */
function circle(d: string): { x: number; y: number; radius: number } | null {
  const n = '([-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?)';
  const pair = `${n}[ ,]+${n}`;
  const arc = `${pair}[ ,]+${n}[ ,]+${n}[ ,]+${n}[ ,]+${pair}`;
  const match = d.trim().match(new RegExp(`^M${pair}a${arc}a${arc}[zZ]$`));
  if (!match) return null;
  const v = match.slice(1).map(Number);
  if (!v.every(Number.isFinite)) return null;
  const [x,y,rx,ry,rot,large,sweep,dx,dy,rx2,ry2,rot2,large2,sweep2,dx2,dy2] = v as number[];
  const eq = (a: number | undefined, b: number | undefined) => Math.abs(a! - b!) < 1e-9;
  if (!(rx! > 0) || !eq(rx,ry) || !eq(rx,rx2) || !eq(rx,ry2) ||
      !eq(rot,0) || !eq(rot2,0) || !eq(large,1) || !eq(large2,1) ||
      !eq(sweep,0) || !eq(sweep2,0) || !eq(dx,2*rx!) || !eq(dx2,-2*rx!) || !eq(dy,0) || !eq(dy2,0)) return null;
  return {x:x!+rx!,y:y!,radius:rx!};
}

/** R12 linear geometry and canonical circles, model coordinates in mm. */
export function toDxf(paths: { d: string; fill?: boolean }[], bounds?: DxfBounds): ExportResult {
  const filename = exportName('pattern', 'flat', 'mm', 'dxf');
  try {
    if (bounds && ![bounds.width, bounds.height].every((n) => Number.isFinite(n) && n > 0)) throw Error('DXF_INVALID_BOUNDS');
    if (!paths.length) throw Error('DXF_EMPTY_DRAWING');
    // Parse everything first so unsupported geometry cannot yield a partial successful file.
    const parsed = paths.map((p) => {
      const c = circle(p.d);
      return { layer: p.fill ? 'outline' : 'detail', circle: c, lines: c ? [] : polylines(p.d) };
    });
    const lines: string[] = [];
    const push = (...values: (string | number)[]) => lines.push(...values.map(String));
    push(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$MEASUREMENT', 70, 1, 0, 'ENDSEC');
    push(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, 2);
    for (const [name, color] of [['outline', 7], ['detail', 1]] as const)
      push(0, 'LAYER', 2, name, 70, 0, 62, color, 6, 'CONTINUOUS');
    push(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
    for (const p of parsed) {
      if (p.circle) {
        const c = p.circle;
        const intervals = bounds ? clipCircle(c, bounds) : [[0, 2 * Math.PI]];
        for (const [start, end] of intervals) {
          if (end! - start! >= 2 * Math.PI - 1e-12)
            push(0, 'CIRCLE', 8, p.layer, 10, c.x, 20, c.y, 30, 0, 40, c.radius);
          else push(0, 'ARC', 8, p.layer, 10, c.x, 20, c.y, 30, 0, 40, c.radius, 50, start! * 180 / Math.PI, 51, end! * 180 / Math.PI);
        }
      }
      for (const line of p.lines) {
        if (bounds) {
          const count = line.points.length - (line.closed ? 0 : 1);
          for (let i = 0; i < count; i++) {
            const clipped = clipLine(line.points[i]!, line.points[(i + 1) % line.points.length]!, bounds);
            if (clipped) push(0, 'LINE', 8, p.layer, 10, clipped[0][0], 20, clipped[0][1], 30, 0,
              11, clipped[1][0], 21, clipped[1][1], 31, 0);
          }
          continue;
        }

      push(0, 'POLYLINE', 8, p.layer, 66, 1, 70, line.closed ? 1 : 0, 10, 0, 20, 0, 30, 0);
      for (const [x, y] of line.points) push(0, 'VERTEX', 8, p.layer, 10, x, 20, y, 30, 0);
      push(0, 'SEQEND', 8, p.layer);
      }
    }
    push(0, 'ENDSEC', 0, 'EOF');
    return { ok: true, filename, bytes: new TextEncoder().encode(lines.join('\n') + '\n') };
  } catch (e) { return { ok: false, filename, error: e instanceof Error ? e.message : 'DXF_INVALID_PATH' }; }
}
