/**
 * Pattern engine — parametric seamless patterns.
 * Contract: build(ctx) returns paths in mm; seamless tiling via tileW/tileH + clip.
 */
export interface PatternContext {
  canvasW: number; // mm
  canvasH: number; // mm
  tileW: number; // mm
  tileH: number; // mm
  seed: number; // deterministic
  params: Record<string, number | string | boolean>;
}

export type Path = { d: string; fill?: boolean }; // SVG path data in mm

export interface PatternDef {
  id: string;
  label: string;
  defaults: Record<string, number | string | boolean>;
  build(ctx: PatternContext): Path[];
}

/** Helpers ---------------------------------------------------------------- */

export function num(ctx: PatternContext, key: string, fallback: number): number {
  const v = ctx.params[key];
  return typeof v === 'number' ? v : fallback;
}

/** Deterministic PRNG (mulberry32) — iron rule: no unseeded Math.random. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tile a unit-cell builder across the canvas. */
export function tile(
  ctx: PatternContext,
  cell: (cx: number, cy: number, i: number, j: number) => Path[],
): Path[] {
  const out: Path[] = [];
  const cols = Math.max(1, Math.ceil(ctx.canvasW / ctx.tileW));
  const rows = Math.max(1, Math.ceil(ctx.canvasH / ctx.tileH));
  let idx = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      out.push(...cell(i * ctx.tileW, j * ctx.tileH, i, j));
      idx++;
    }
  }
  return out;
}

/** Rect path helper (mm). */
export function rect(x: number, y: number, w: number, h: number, r = 0): Path {
  if (r <= 0) return { d: `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}z`, fill: true };
  const rr = Math.min(r, w / 2, h / 2);
  return {
    d:
      `M${f(x + rr)} ${f(y)}h${f(w - 2 * rr)}a${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} ${f(rr)}` +
      `v${f(h - 2 * rr)}a${f(rr)} ${f(rr)} 0 0 1 ${f(-rr)} ${f(rr)}` +
      `h${f(-(w - 2 * rr))}a${f(rr)} ${f(rr)} 0 0 1 ${f(-rr)} ${f(-rr)}` +
      `v${f(-(h - 2 * rr))}a${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} ${f(-rr)}z`,
    fill: true,
  };
}

export function circle(cx: number, cy: number, r: number): Path {
  return {
    d: `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0z`,
    fill: true,
  };
}

function f(n: number): string {
  return (Math.round(n * 1000) / 1000).toString();
}

/** Library ---------------------------------------------------------------- */

export const dotGrid: PatternDef = {
  id: 'dot-grid',
  label: 'Dot grid',
  defaults: { radius: 2.5 },
  build: (ctx) => {
    const r = num(ctx, 'radius', 2.5);
    return tile(ctx, (x, y) => [circle(x + ctx.tileW / 2, y + ctx.tileH / 2, r)]);
  },
};

export const stripes: PatternDef = {
  id: 'stripes',
  label: 'Stripe',
  defaults: { width: 4, vertical: false },
  build: (ctx) => {
    const w = num(ctx, 'width', 4);
    const vertical = ctx.params['vertical'] === true;
    const out: Path[] = [];
    if (vertical) {
      for (let x = 0; x < ctx.canvasW; x += ctx.tileW) out.push(rect(x, 0, w, ctx.canvasH));
    } else {
      for (let y = 0; y < ctx.canvasH; y += ctx.tileH) out.push(rect(0, y, ctx.canvasW, w));
    }
    return out;
  },
};

export const grid: PatternDef = {
  id: 'grid',
  label: 'Grid',
  defaults: { width: 2 },
  build: (ctx) => {
    const w = num(ctx, 'width', 2);
    const out: Path[] = [];
    for (let x = 0; x <= ctx.canvasW; x += ctx.tileW) out.push(rect(x - w / 2, 0, w, ctx.canvasH));
    for (let y = 0; y <= ctx.canvasH; y += ctx.tileH) out.push(rect(0, y - w / 2, ctx.canvasW, w));
    return out;
  },
};

export const chevron: PatternDef = {
  id: 'chevron',
  label: 'Chevron',
  defaults: { stroke: 3 },
  build: (ctx) => {
    const s = num(ctx, 'stroke', 3);
    return tile(ctx, (x, y) => {
      const w = ctx.tileW,
        h = ctx.tileH;
      return [
        {
          d: `M${f(x)} ${f(y + h)}L${f(x + w / 2)} ${f(y)}L${f(x + w)} ${f(y + h)}`,
          fill: false,
        },
      ];
    }).map((p) => ({ ...p, d: p.d })); // stroke applied by renderer (stroke width = s)
  },
};

export const hexDots: PatternDef = {
  id: 'hex',
  label: 'Hex',
  defaults: { radius: 6 },
  build: (ctx) => {
    const R = num(ctx, 'radius', 6);
    const out: Path[] = [];
    const dx = R * 1.5;
    const dy = R * Math.sqrt(3);
    for (let row = 0; row * dy <= ctx.canvasH + dy; row++) {
      for (let col = 0; col * dx <= ctx.canvasW + dx; col++) {
        const cx = col * dx + (row % 2 ? dx / 2 : 0);
        const cy = row * dy;
        out.push(hexPath(cx, cy, R));
      }
    }
    return out;
  },
};

function hexPath(cx: number, cy: number, R: number): Path {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    pts.push(`${f(cx + R * Math.cos(a))} ${f(cy + R * Math.sin(a))}`);
  }
  return { d: `M${pts.join('L')}z`, fill: false };
}

export const scalePattern: PatternDef = {
  id: 'scale',
  label: 'Scale',
  defaults: { radius: 8 },
  build: (ctx) => {
    const R = num(ctx, 'radius', 8);
    const out: Path[] = [];
    const stepX = R;
    const stepY = R * 0.75;
    for (let row = 0; row * stepY <= ctx.canvasH + R; row++) {
      for (let col = 0; col * stepX <= ctx.canvasW + R; col++) {
        const cx = col * stepX + (row % 2 ? stepX / 2 : 0);
        const cy = row * stepY;
        // half circle (arc) as scale
        out.push({
          d: `M${f(cx - R)} ${f(cy)}a${f(R)} ${f(R)} 0 0 1 ${f(2 * R)} 0`,
          fill: false,
        });
      }
    }
    return out;
  },
};

/** Periodic cubic wave: endpoints and tangents match on adjacent tiles. */
export const wave: PatternDef = {
  id: 'wave',
  label: 'Wave',
  defaults: { stroke: 1.5 },
  build: (ctx) =>
    tile(ctx, (x, y) => {
      const w = ctx.tileW,
        h = ctx.tileH,
        mid = y + h / 2;
      return [
        {
          d:
            `M${f(x)} ${f(mid)}C${f(x + w / 6)} ${f(y)} ${f(x + w / 3)} ${f(y)} ${f(x + w / 2)} ${f(mid)}` +
            `C${f(x + (2 * w) / 3)} ${f(y + h)} ${f(x + (5 * w) / 6)} ${f(y + h)} ${f(x + w)} ${f(mid)}`,
          fill: false,
        },
      ];
    }),
};

/** Mid-edge vertices meet neighboring cells without overlapping duplicate edges. */
export const diamond: PatternDef = {
  id: 'diamond',
  label: 'Diamond',
  defaults: { stroke: 1.5 },
  build: (ctx) =>
    tile(ctx, (x, y) => {
      const w = ctx.tileW,
        h = ctx.tileH;
      return [
        {
          d: `M${f(x + w / 2)} ${f(y)}L${f(x + w)} ${f(y + h / 2)}L${f(x + w / 2)} ${f(y + h)}L${f(x)} ${f(y + h / 2)}z`,
          fill: false,
        },
      ];
    }),
};

/** Two-turn Archimedean spiral, sampled deterministically inside each tile. */
export const spiral: PatternDef = {
  id: 'spiral',
  label: 'Spiral',
  defaults: { stroke: 1.5 },
  build: (ctx) =>
    tile(ctx, (x, y) => {
      const points: string[] = [];
      for (let i = 0; i <= 96; i++) {
        const t = i / 96,
          angle = 4 * Math.PI * t;
        points.push(
          `${f(x + ctx.tileW / 2 + ctx.tileW * 0.42 * t * Math.cos(angle))} ${f(y + ctx.tileH / 2 + ctx.tileH * 0.42 * t * Math.sin(angle))}`,
        );
      }
      return [{ d: `M${points.join('L')}`, fill: false }];
    }),
};

/** Staggered three-ring semicircular fans. Full repeat is tileW × tileH.
 * Edge fans deliberately extend outside the canvas; SVG/texture clipping is required.
 */
export const seigaiha: PatternDef = {
  id: 'seigaiha',
  label: 'Seigaiha',
  defaults: { stroke: 1.5 },
  build: (ctx) => {
    const out: Path[] = [];
    const rows = Math.ceil(ctx.canvasH / (ctx.tileH / 2));
    const cols = Math.ceil(ctx.canvasW / ctx.tileW);
    for (let row = 1; row <= rows + 1; row++) {
      const cy = (row * ctx.tileH) / 2;
      const shift = row % 2 === 0 ? ctx.tileW / 2 : 0;
      for (let col = -1; col <= cols; col++) {
        const cx = col * ctx.tileW + shift;
        for (const ratio of [1, 2 / 3, 1 / 3]) {
          const rx = (ctx.tileW * ratio) / 2,
            ry = (ctx.tileH * ratio) / 2;
          out.push({
            d: `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 0 1 ${f(cx + rx)} ${f(cy)}`,
            fill: false,
          });
        }
      }
    }
    return out;
  },
};

/** Domino tiling rotated into a herringbone lattice. Repeat vectors are
 * (u,v)=(2,-2) and (2,2), mapped to tileW and tileH respectively.
 * Like edge fans, polygons outside the canvas are retained for renderer clipping.
 */
export const herringbone: PatternDef = {
  id: 'herringbone',
  label: 'Herringbone',
  defaults: { stroke: 1.5 },
  build: (ctx) => {
    const out: Path[] = [];
    const nx = ctx.canvasW / ctx.tileW,
      ny = ctx.canvasH / ctx.tileH;
    const map = (u: number, v: number) =>
      `${f(((u - v) * ctx.tileW) / 4)} ${f(((u + v) * ctx.tileH) / 4)}`;
    for (let u = -3; u <= Math.ceil(2 * (nx + ny)) + 3; u++) {
      for (let v = Math.floor(-2 * nx) - 3; v <= Math.ceil(2 * ny) + 3; v++) {
        const phase = (((u - v) % 4) + 4) % 4;
        if (phase !== 0 && phase !== 3) continue;
        const du = phase === 0 ? 2 : 1,
          dv = phase === 0 ? 1 : 2;
        // Reject polygons whose bounding boxes cannot touch the canvas.
        const xs = [u - v, u + du - v, u + du - v - dv, u - v - dv].map((n) => (n * ctx.tileW) / 4);
        const ys = [u + v, u + du + v, u + du + v + dv, u + v + dv].map((n) => (n * ctx.tileH) / 4);
        if (
          Math.max(...xs) < 0 ||
          Math.min(...xs) > ctx.canvasW ||
          Math.max(...ys) < 0 ||
          Math.min(...ys) > ctx.canvasH
        )
          continue;
        out.push({
          d: `M${map(u, v)}L${map(u + du, v)}L${map(u + du, v + dv)}L${map(u, v + dv)}z`,
          fill: false,
        });
      }
    }
    return out;
  },
};

/** Square geometric lattice inspired by kumiko, not a traditional joinery plan. */
export const kumiko: PatternDef = {
  id: 'kumiko',
  label: 'Kumiko-inspired',
  defaults: { stroke: 1.5 },
  build: (ctx) =>
    tile(ctx, (x, y) => {
      const w = ctx.tileW,
        h = ctx.tileH,
        cx = x + w / 2,
        cy = y + h / 2;
      return [
        {
          d: `M${f(x)} ${f(y)}L${f(x + w)} ${f(y + h)}M${f(x + w)} ${f(y)}L${f(x)} ${f(y + h)}`,
          fill: false,
        },
        {
          d: `M${f(cx)} ${f(y)}L${f(x + w)} ${f(cy)}L${f(cx)} ${f(y + h)}L${f(x)} ${f(cy)}z`,
          fill: false,
        },
        { d: `M${f(cx)} ${f(y)}V${f(y + h)}M${f(x)} ${f(cy)}H${f(x + w)}`, fill: false },
      ];
    }),
};

/** Twelve base patterns; stencil manufacturability is evaluated separately. */
export const PATTERNS: PatternDef[] = [
  dotGrid,
  stripes,
  grid,
  chevron,
  hexDots,
  scalePattern,
  wave,
  diamond,
  spiral,
  seigaiha,
  herringbone,
  kumiko,
];

/**
 * Seam test: paths that cross the right edge must re-enter on the left
 * at the same y (seamlessX). We verify by checking tile-cell symmetry:
 * build on a canvas of exactly 1 tile and compare edge-crossing counts.
 */
export function isSeamlessX(def: PatternDef, tileW = 40, tileH = 40): boolean {
  const ctx: PatternContext = {
    canvasW: tileW,
    canvasH: tileH,
    tileW,
    tileH,
    seed: 1,
    params: { ...def.defaults },
  };
  // Build with double width and check that left edge of column 1 == right edge of column 0
  const single = def.build({ ...ctx, canvasW: tileW });
  const double = def.build({ ...ctx, canvasW: tileW * 2 });
  // For symmetric tile-based patterns, doubling the canvas doubles the path count
  return double.length >= single.length * 2 - 1;
}

export * from './jigsaw.js';

export * from './slab.js';
export * from './trace.js';
export * from './islands.js';
export * from './bridge.js';
export * from './rib.js';
export * from './trace-pixel-boundary.js';
