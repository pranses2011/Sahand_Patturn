import { flattenCubic } from './bezier.js';
import { clipLine, clipCircle, type DxfBounds } from './dxf-clip.js';
import { exportName, type ExportResult } from './index.js';

type Point = [number, number];
/** Linear SVG plus C/S/Q/T with explicit flattening tolerance. Unsupported commands fail atomically. */
function polylines(d: string, tolerance?: number): { points: Point[]; closed: boolean }[] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? [];
  if (d.replace(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g, '').replace(/[\s,]/g, ''))
    throw Error('DXF_INVALID_PATH');
  let i = 0,
    command = '',
    x = 0,
    y = 0;
  let points: Point[] = [];
  let previousOp = '';
  let cubicControl: Point | null = null,
    quadraticControl: Point | null = null;
  const out: { points: Point[]; closed: boolean }[] = [];
  const flush = (closed = false) => {
    if (points.length < 2) throw Error('DXF_DEGENERATE_SUBPATH');
    out.push({ points, closed });
    points = [];
  };
  const number = () => {
    const token = tokens[i++];
    if (token === undefined || /^[a-zA-Z]$/.test(token) || !Number.isFinite(Number(token)))
      throw Error('DXF_INVALID_NUMBER');
    return Number(token);
  };
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i]!)) command = tokens[i++]!;
    if (!/^[MmLlHhVvZzCcSsQqTt]$/.test(command)) throw Error('DXF_UNSUPPORTED_COMMAND');
    const op = command.toUpperCase(),
      relative = command !== op;
    if (op === 'Z') {
      if (!points.length) throw Error('DXF_INVALID_CLOSE');
      [x, y] = points[0]!;
      flush(true);
      command = '';
      previousOp = '';
      cubicControl = null;
      quadraticControl = null;
      continue;
    }
    if (op !== 'M' && !points.length) throw Error('DXF_MISSING_MOVE');
    if (op === 'C' || op === 'S' || op === 'Q' || op === 'T') {
      if (tolerance === undefined)
        throw Error(
          op === 'Q' || op === 'T'
            ? 'DXF_QUADRATIC_REQUIRES_EXPLICIT_TOLERANCE'
            : 'DXF_CUBIC_REQUIRES_EXPLICIT_TOLERANCE',
        );
      const start: Point = [x, y];
      const point = (): Point => [number() + (relative ? x : 0), number() + (relative ? y : 0)];
      const reflect = (control: Point): Point => [2 * x - control[0], 2 * y - control[1]];
      let b: Point, c: Point, end: Point;
      if (op === 'C' || op === 'S') {
        b =
          op === 'C'
            ? point()
            : (previousOp === 'C' || previousOp === 'S') && cubicControl
              ? reflect(cubicControl)
              : [x, y];
        c = point();
        end = point();
        cubicControl = c;
        quadraticControl = null;
      } else {
        const control: Point =
          op === 'Q'
            ? point()
            : (previousOp === 'Q' || previousOp === 'T') && quadraticControl
              ? reflect(quadraticControl)
              : [x, y];
        end = point();
        b = [x + ((control[0] - x) * 2) / 3, y + ((control[1] - y) * 2) / 3];
        c = [end[0] + ((control[0] - end[0]) * 2) / 3, end[1] + ((control[1] - end[1]) * 2) / 3];
        quadraticControl = control;
        cubicControl = null;
      }
      points.push(...flattenCubic(start, b, c, end, tolerance).slice(1));
      [x, y] = end;
      previousOp = op;
      continue;
    }
    previousOp = op;
    cubicControl = null;
    quadraticControl = null;
    if (op === 'M' || op === 'L') {
      const a = number(),
        b = number();
      x = a + (relative ? x : 0);
      y = b + (relative ? y : 0);
      if (op === 'M') {
        if (points.length) flush();
        command = relative ? 'l' : 'L';
      }
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
  const [x, y, rx, ry, rot, large, sweep, dx, dy, rx2, ry2, rot2, large2, sweep2, dx2, dy2] =
    v as number[];
  const eq = (a: number | undefined, b: number | undefined) => Math.abs(a! - b!) < 1e-9;
  if (
    !(rx! > 0) ||
    !eq(rx, ry) ||
    !eq(rx, rx2) ||
    !eq(rx, ry2) ||
    !eq(rot, 0) ||
    !eq(rot2, 0) ||
    !eq(large, 1) ||
    !eq(large2, 1) ||
    !eq(sweep, 0) ||
    !eq(sweep2, 0) ||
    !eq(dx, 2 * rx!) ||
    !eq(dx2, -2 * rx!) ||
    !eq(dy, 0) ||
    !eq(dy2, 0)
  )
    return null;
  return { x: x! + rx!, y: y!, radius: rx! };
}

/** Single circular SVG arc; no concatenated commands or ellipses accepted.
 * Endpoint conversion follows SVG radius correction for an undersized radius.
 */
function circularArc(
  d: string,
): { x: number; y: number; radius: number; intervals: [number, number][] } | null {
  const n = '([-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?)';
  const match = d
    .trim()
    .match(new RegExp(`^M${n}[ ,]+${n}([Aa])${Array(7).fill(n).join('[ ,]+')}$`));
  if (!match) return null;
  const x1 = Number(match[1]),
    y1 = Number(match[2]),
    relative = match[3] === 'a';
  const [rx, ry, rotation, large, sweep, ex, ey] = match.slice(4).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (
    ![x1, y1, rx, ry, rotation, large, sweep, ex, ey].every(Number.isFinite) ||
    rx <= 0 ||
    rx !== ry ||
    rotation !== 0 ||
    ![0, 1].includes(large) ||
    ![0, 1].includes(sweep)
  )
    return null;
  const x2 = ex + (relative ? x1 : 0),
    y2 = ey + (relative ? y1 : 0);
  const dx = x2 - x1,
    dy = y2 - y1,
    chord = Math.hypot(dx, dy);
  if (!(chord > 0) || !Number.isFinite(chord)) return null;
  const radius = Math.max(rx, chord / 2);
  const height = Math.sqrt(Math.max(0, (radius - chord / 2) * (radius + chord / 2)));
  const sign = large === sweep ? -1 : 1;
  const x = (x1 + x2) / 2 - ((sign * dy) / chord) * height,
    y = (y1 + y2) / 2 + ((sign * dx) / chord) * height;
  if (![x, y, radius].every(Number.isFinite)) return null;
  const tau = 2 * Math.PI;
  const angle = (px: number, py: number) => (Math.atan2(py - y, px - x) + tau) % tau;
  const a = sweep ? angle(x1, y1) : angle(x2, y2),
    b = sweep ? angle(x2, y2) : angle(x1, y1);
  const intervals: [number, number][] =
    a < b
      ? [[a, b]]
      : [
          [a, tau],
          [0, b],
        ];
  return { x, y, radius, intervals: intervals.filter(([lo, hi]) => hi - lo > 1e-12) };
}

/** R12 linear geometry and canonical circles, model coordinates in mm. */
export function toDxf(
  paths: { d: string; fill?: boolean }[],
  bounds?: DxfBounds,
  options: { bezierToleranceMm?: number } = {},
): ExportResult {
  const filename = exportName('pattern', 'flat', 'mm', 'dxf');
  try {
    if (
      options.bezierToleranceMm !== undefined &&
      (!Number.isFinite(options.bezierToleranceMm) ||
        options.bezierToleranceMm < 0.001 ||
        options.bezierToleranceMm > 1)
    )
      throw Error('DXF_INVALID_BEZIER_TOLERANCE');
    if (bounds && ![bounds.width, bounds.height].every((n) => Number.isFinite(n) && n > 0))
      throw Error('DXF_INVALID_BOUNDS');
    if (!paths.length) throw Error('DXF_EMPTY_DRAWING');
    // Parse everything first so unsupported geometry cannot yield a partial successful file.
    const parsed = paths.map((p) => {
      const c = circle(p.d);
      const arc = c ? null : circularArc(p.d);
      return {
        arc,
        layer: p.fill ? 'outline' : 'detail',
        circle: c,
        lines: c || arc ? [] : polylines(p.d, options.bezierToleranceMm),
      };
    });
    const lines: string[] = [];
    const push = (...values: (string | number)[]) => lines.push(...values.map(String));
    if (options.bezierToleranceMm !== undefined)
      push(
        999,
        `Cubic Bezier approximated by lines; tolerance ${options.bezierToleranceMm} mm before canvas clipping`,
      );
    push(
      0,
      'SECTION',
      2,
      'HEADER',
      9,
      '$ACADVER',
      1,
      'AC1009',
      9,
      '$MEASUREMENT',
      70,
      1,
      0,
      'ENDSEC',
    );
    push(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, 2);
    for (const [name, color] of [
      ['outline', 7],
      ['detail', 1],
    ] as const)
      push(0, 'LAYER', 2, name, 70, 0, 62, color, 6, 'CONTINUOUS');
    push(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
    for (const p of parsed) {
      if (p.circle) {
        const c = p.circle;
        const intervals = bounds ? clipCircle(c, bounds) : [[0, 2 * Math.PI]];
        for (const [start, end] of intervals) {
          if (end! - start! >= 2 * Math.PI - 1e-12)
            push(0, 'CIRCLE', 8, p.layer, 10, c.x, 20, c.y, 30, 0, 40, c.radius);
          else
            push(
              0,
              'ARC',
              8,
              p.layer,
              10,
              c.x,
              20,
              c.y,
              30,
              0,
              40,
              c.radius,
              50,
              (start! * 180) / Math.PI,
              51,
              (end! * 180) / Math.PI,
            );
        }
      }
      if (p.arc) {
        const c = p.arc;
        const clips: [number, number][] = bounds ? clipCircle(c, bounds) : [[0, 2 * Math.PI]];
        for (const [a, b] of c.intervals)
          for (const [lo, hi] of clips) {
            const start = Math.max(a, lo),
              end = Math.min(b, hi);
            if (end - start > 1e-12)
              push(
                0,
                'ARC',
                8,
                p.layer,
                10,
                c.x,
                20,
                c.y,
                30,
                0,
                40,
                c.radius,
                50,
                (start * 180) / Math.PI,
                51,
                (end * 180) / Math.PI,
              );
          }
      }
      for (const line of p.lines) {
        if (bounds) {
          const count = line.points.length - (line.closed ? 0 : 1);
          for (let i = 0; i < count; i++) {
            const clipped = clipLine(
              line.points[i]!,
              line.points[(i + 1) % line.points.length]!,
              bounds,
            );
            if (clipped)
              push(
                0,
                'LINE',
                8,
                p.layer,
                10,
                clipped[0][0],
                20,
                clipped[0][1],
                30,
                0,
                11,
                clipped[1][0],
                21,
                clipped[1][1],
                31,
                0,
              );
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
  } catch (e) {
    return { ok: false, filename, error: e instanceof Error ? e.message : 'DXF_INVALID_PATH' };
  }
}
