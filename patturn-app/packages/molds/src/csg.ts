/**
 * CSG boolean via manifold-3d (WASM) — ADR-001 primary kernel.
 * mold = block − form (scaled by 1/(1−shrink)); split by plane; keys added.
 * Async init (WASM load) → call initCsg() once at app startup.
 */
import type { Mesh, Profile } from '@patturn/kernel';
import { validateMesh } from '@patturn/kernel';
import type { SplitPlan } from './index.js';

type ManifoldT = {
  volume(): number;
  genus(): number;
  numTri(): number;
  getMesh(): { triVerts: Uint32Array; vertProperties: Float32Array; numProp: number };
  subtract(o: ManifoldT): ManifoldT;
  add(o: ManifoldT): ManifoldT;
  intersect(o: ManifoldT): ManifoldT;
  minkowskiSum(o: ManifoldT): ManifoldT;
  simplify(tolerance?: number): ManifoldT;
  splitByPlane(normal: [number, number, number], offset: number): ManifoldT[];
  translate(v: [number, number, number]): ManifoldT;
  scale(v: number | [number, number, number]): ManifoldT;
  rotate(xOrVec: number | [number, number, number], y?: number, z?: number): ManifoldT;
  mirror(v: [number, number, number]): ManifoldT;
  boundingBox(): { min: [number, number, number]; max: [number, number, number] };
  trimByPlane(normal: [number, number, number], offset: number): ManifoldT;
  delete?(): void;
};

type Wasm = {
  setup(): void;
  Manifold: {
    cube(size: [number, number, number], center: boolean): ManifoldT;
    cylinder(height: number, radiusLow: number, radiusHigh: number, segments: number, center: boolean): ManifoldT;
    sphere(radius: number, circularSegments: number): ManifoldT;
    new (mesh?: unknown): ManifoldT;
  };
  Mesh: new (m: { numProp?: number; triVerts: Uint32Array; vertProperties: Float32Array }) => unknown;
};

let wasm: Wasm | null = null;

/** Load WASM kernel once. Safe to call repeatedly. */
export async function initCsg(): Promise<void> {
  if (wasm) return;
  const mod = (await import('manifold-3d')).default;
  const instance = (await mod()) as Wasm;
  instance.setup();
  wasm = instance;
}

export function csgReady(): boolean {
  return wasm !== null;
}

function requireWasm(): Wasm {
  if (!wasm) throw new Error('CSG_NOT_INITIALIZED — call initCsg() first');
  return wasm;
}

/** Our Mesh → manifold Mesh. */
function toManifold(m: Mesh): ManifoldT {
  const w = requireWasm();
  const mesh = new w.Mesh({ numProp: 3, triVerts: m.indices, vertProperties: m.positions });
  return new w.Manifold(mesh as never);
}

/** manifold → our Mesh contract. */
function fromManifold(man: ManifoldT): Mesh {
  const raw = man.getMesh();
  const positions = new Float32Array(raw.vertProperties.length);
  positions.set(raw.vertProperties);
  return {
    positions,
    indices: new Uint32Array(raw.triVerts),
    meta: { volumeMm3: man.volume() },
  };
}

export interface BlockOptions {
  /** form bbox (already shrink-scaled if needed) */
  min: [number, number, number];
  max: [number, number, number];
  wall?: number; // default 25
  base?: number; // default 20
  draftDeg?: number; // default 1.5 — side taper so the block releases from the mother mold
}

/** Keep the half-space a·x+b·y+c·z ≤ d (trimByPlane keeps p·n̂ ≥ offset; n̂ auto-normalized). */
function trimKeepLE(man: ManifoldT, a: number, b: number, c: number, d: number): ManifoldT {
  const n = Math.hypot(a, b, c);
  return man.trimByPlane([-a, -b, -c], -d / n);
}

/**
 * Solid block around the form: w+2wall, d+2wall, h+base+wall (site spec),
 * with draft taper on the four side faces (edge(y) = half − tan(draft)·(y − ybot)).
 */
export function buildBlock(opts: BlockOptions): ManifoldT {
  const w = requireWasm();
  const wall = opts.wall ?? 25;
  const base = opts.base ?? 20;
  const draftDeg = opts.draftDeg ?? 1.5;
  const bw = opts.max[0] - opts.min[0] + wall * 2;
  const bd = opts.max[2] - opts.min[2] + wall * 2;
  const bh = opts.max[1] - opts.min[1] + base + wall;
  const cx = (opts.min[0] + opts.max[0]) / 2;
  const cz = (opts.min[2] + opts.max[2]) / 2;
  const ybot = opts.min[1] - base;
  const box = w.Manifold.cube([bw, bh, bd], false);
  // cube(size, false) spans [0,size] — shift so it is centered on X/Z and sits below the form
  let block = box.translate([cx - bw / 2, ybot, cz - bd / 2]);
  const t = Math.tan((draftDeg * Math.PI) / 180);
  if (t > 0) {
    const hx = bw / 2, hz = bd / 2;
    block = trimKeepLE(block, 1, t, 0, cx + hx + t * ybot); // +x face
    block = trimKeepLE(block, -1, t, 0, -(cx - hx) + t * ybot); // −x face
    block = trimKeepLE(block, 0, t, 1, cz + hz + t * ybot); // +z face
    block = trimKeepLE(block, 0, t, -1, -(cz - hz) + t * ybot); // −z face
  }
  return block;
}

/**
 * Single-piece drop-out mold: block − form.
 * `formMesh` must be a closed solid (the outer form).
 */
export function subtractForm(block: ManifoldT, formMesh: Mesh): ManifoldT {
  return block.subtract(toManifold(formMesh));
}

/** Split mold solid by plane (normal pointing to keep-side). Returns 2 pieces. */
export function splitMold(mold: ManifoldT, normal: [number, number, number], offset: number): ManifoldT[] {
  return mold.splitByPlane(normal, offset);
}

/**
 * Registration key: tapered cylinder (site: r=8, h=10, taper 4°).
 * axis 'y' → height along +Y (horizontal parting plane);
 * axis 'z' → height along +Z (vertical parting plane, no rotation).
 */
export function makeKeyMale(r = 8, h = 10, taperDeg = 4, axis: 'y' | 'z' = 'y'): ManifoldT {
  const w = requireWasm();
  const rTop = r + h * Math.tan((taperDeg * Math.PI) / 180);
  // manifold cylinder is along Z — rotate to Y so height maps to Y
  const cyl = w.Manifold.cylinder(h, r, rTop, 32, false);
  return axis === 'y' ? cyl.rotate([-90, 0, 0]) : cyl;
}

/** Female socket = male + clearance (site default 0.2mm radial). */
export function makeKeyFemale(r = 8, h = 10, taperDeg = 4, clearance = 0.2, axis: 'y' | 'z' = 'y'): ManifoldT {
  return makeKeyMale(r + clearance, h + clearance, taperDeg, axis);
}

/** Place keys on a parting plane: subtract females from part B, union males onto part A. */
export function applyKeys(
  partA: ManifoldT,
  partB: ManifoldT,
  positions: [number, number, number][],
  r = 8,
  h = 10,
  taperDeg = 4,
  clearance = 0.2,
  axis: 'y' | 'z' = 'y',
): [ManifoldT, ManifoldT] {
  let a = partA;
  let b = partB;
  for (const pos of positions) {
    const male = makeKeyMale(r, h, taperDeg, axis).translate(pos);
    const female = makeKeyFemale(r, h, taperDeg, clearance, axis).translate(pos);
    a = a.add(male);
    b = b.subtract(female);
  }
  return [a, b];
}

/** Export a manifold as our validated Mesh; throws if not manifold. */
export function toValidatedMesh(man: ManifoldT): Mesh {
  const mesh = fromManifold(man);
  const report = validateMesh(mesh);
  if (!report.ok) throw new Error(`CSG_MESH_INVALID: ${report.problems.join(',')}`);
  return mesh;
}

/** Convenience: full single-part mold pipeline → Mesh (validated). */
export async function buildSingleMold(formMesh: Mesh, opts?: Partial<BlockOptions> & { shrink?: number }): Promise<Mesh> {
  await initCsg();
  const shrink = opts?.shrink ?? 0;
  // scale form up by 1/(1−s) so fired piece hits final size
  const s = shrink > 0 ? 1 / (1 - shrink) : 1;
  const scaled: Mesh = {
    ...formMesh,
    positions: Float32Array.from(formMesh.positions, (v, i) => (i % 3 === 1 ? v * s : v * s)),
  };
  const man = toManifold(scaled);
  const bb = man.boundingBox();
  const block = buildBlock({ min: bb.min, max: bb.max, wall: opts?.wall, base: opts?.base, draftDeg: opts?.draftDeg });
  const mold = block.subtract(man); // man is already a ManifoldT
  return toValidatedMesh(mold);
}

export interface SplitMoldOptions {
  shrink?: number; // 0..1 — form scaled by 1/(1−s) like buildSingleMold
  wall?: number;
  base?: number;
  draftDeg?: number;
  /** profile-space (unshrunk) profile — required for key placement */
  profile?: Profile;
}

/**
 * Multi-part mold (checklist 6.4): block − form, split by the plan plane,
 * registration keys on the parting face. Returns [A, B] where A is the
 * negative side (gets male keys) and B the positive side (female sockets).
 * plan.kind 'none' → single piece, identical to buildSingleMold.
 */
export async function buildSplitMold(formMesh: Mesh, plan: SplitPlan, opts?: SplitMoldOptions): Promise<Mesh[]> {
  await initCsg();
  if (plan.kind === 'none') return [await buildSingleMold(formMesh, opts)];
  const shrink = opts?.shrink ?? 0;
  const s = shrink > 0 ? 1 / (1 - shrink) : 1;
  const wall = opts?.wall ?? 25;
  const base = opts?.base ?? 20;
  const draftDeg = opts?.draftDeg ?? 1.5;
  const scaled: Mesh = {
    ...formMesh,
    positions: Float32Array.from(formMesh.positions, (v) => v * s),
  };
  const man = toManifold(scaled);
  const bb = man.boundingBox();
  const block = buildBlock({ min: bb.min, max: bb.max, wall, base, draftDeg });
  const mold = block.subtract(man);
  const offset = plan.kind === 'horizontal' ? plan.offset * s : plan.offset;
  const [pos, neg] = mold.splitByPlane(plan.normal, offset);

  // key placement helpers (all in scaled/mesh space)
  const t = Math.tan((draftDeg * Math.PI) / 180);
  const ybot = bb.min[1] - base;
  const halfX = (bb.max[0] - bb.min[0]) / 2 + wall;
  const halfZ = (bb.max[2] - bb.min[2]) / 2 + wall;
  const edge = (y: number) => Math.min(halfX, halfZ) - t * (y - ybot);
  const profile = opts?.profile;
  const radiusAt = (y: number): number => {
    if (!profile || profile.length < 2) return 0;
    const py = y / s;
    for (let i = 0; i < profile.length - 1; i++) {
      const a = profile[i]!, b = profile[i + 1]!;
      if (py >= a.y && py <= b.y && b.y > a.y) {
        return (a.r + ((b.r - a.r) * (py - a.y)) / (b.y - a.y)) * s;
      }
    }
    return profile[profile.length - 1]!.r * s;
  };
  const maxRadiusOver = (y0: number, y1: number): number => {
    let m = radiusAt(y1);
    for (let y = y0; y < y1; y += 2) m = Math.max(m, radiusAt(y));
    return m;
  };

  let positions: [number, number, number][] = [];
  let axis: 'y' | 'z' = 'y';
  if (plan.kind === 'horizontal') {
    const y0 = plan.y * s;
    const r0 = radiusAt(y0);
    const rk = Math.min(r0 + wall / 2, edge(y0) - 9);
    positions = [[rk, y0, 0], [0, y0, rk], [-rk, y0, 0], [0, y0, -rk]];
    axis = 'y';
  } else {
    const yMin = bb.min[1], yMax = bb.max[1];
    const ys = [yMin + (yMax - yMin) / 3, yMin + (2 * (yMax - yMin)) / 3];
    for (const y of ys) {
      const xk = Math.min(maxRadiusOver(y - 9, y + 9) + wall / 2, edge(y) - 9);
      positions.push([xk, y, 0], [-xk, y, 0]);
    }
    axis = 'z';
  }
  const [a, b] = applyKeys(neg!, pos!, positions, 8, 10, 4, 0.2, axis);
  return [toValidatedMesh(a), toValidatedMesh(b)];
}

export interface MotherMoldOptions {
  wallMm?: number;
  flangeMm?: number;
  barrierMm?: number;
  sprueDia?: number;
  ventDia?: number;
  siliconeDensity?: number;
}

export interface MotherMoldResult {
  /** Exact positive plaster part, in assembly coordinates. */
  master: Mesh;
  /** Rectangular casting-space solid, not a conformal offset surface. */
  castingSpace: Mesh;
  jacket: [Mesh, Mesh];
  siliconeVolumeMm3: number;
  siliconeKg: number;
  cavityBounds: { min: [number, number, number]; max: [number, number, number] };
}

/**
 * Rectangular silicone casting jacket around ONE positive plaster master.
 * Two flanged halves split at the master bbox mid-Z, a top pouring port and
 * two top vents. barrierMm is minimum bbox clearance, NOT a uniform offset.
 * The silicone estimate excludes feed/vent channels and process waste.
 */
export async function buildMotherMold(master: Mesh, opts: MotherMoldOptions = {}): Promise<MotherMoldResult> {
  const wall = opts.wallMm ?? 10, flange = opts.flangeMm ?? 15;
  const gap = opts.barrierMm ?? 2, sprue = opts.sprueDia ?? 12, vent = opts.ventDia ?? 4;
  const density = opts.siliconeDensity ?? 1.15;
  if (![wall, flange, gap, sprue, vent, density].every((n) => Number.isFinite(n) && n > 0)) {
    throw new Error('MOTHER_INVALID_OPTIONS');
  }
  const report = validateMesh(master);
  if (!report.ok) throw new Error(`MOTHER_INVALID_MASTER: ${report.problems.join(',')}`);
  await initCsg();
  const w = requireWasm();
  const man = toManifold(master);
  const bb = man.boundingBox();
  const min = bb.min.map((v) => v - gap) as [number, number, number];
  const max = bb.max.map((v) => v + gap) as [number, number, number];
  const size = max.map((v, i) => v - min[i]!) as [number, number, number];
  // Keep ports distinct, with solid wall between each opening and cavity sides.
  if (sprue + 2 * vent + 4 * wall >= size[0] || Math.max(sprue, vent) + 2 * wall >= size[2]) {
    throw new Error('MOTHER_PORTS_DO_NOT_FIT');
  }
  const cavity = w.Manifold.cube(size, false).translate(min);
  const outside = w.Manifold.cube(size.map((v) => v + 2 * wall) as [number, number, number], false)
    .translate(min.map((v) => v - wall) as [number, number, number]);
  const midZ = (min[2] + max[2]) / 2;
  // A rectangular ring around the splitting plane forms matching clamp flanges.
  const flangeOuter = w.Manifold.cube([size[0] + 2 * (wall + flange), size[1] + 2 * (wall + flange), 2 * wall], false)
    .translate([min[0] - wall - flange, min[1] - wall - flange, midZ - wall]);
  let jacket = outside.add(flangeOuter).subtract(cavity);
  const cx = (min[0] + max[0]) / 2;
  const port = (x: number, diameter: number) => w.Manifold.cylinder(wall + flange + 2, diameter / 2, diameter / 2, 32, false)
    .rotate([-90, 0, 0]).translate([x, max[1] - 1, midZ]);
  jacket = jacket.subtract(port(cx, sprue));
  const ventX = size[0] / 2 - wall - vent / 2;
  jacket = jacket.subtract(port(cx - ventX, vent)).subtract(port(cx + ventX, vent));
  const [positive, negative] = jacket.splitByPlane([0, 0, 1], midZ);
  const siliconeVolumeMm3 = cavity.volume() - man.volume();
  return {
    master, castingSpace: toValidatedMesh(cavity),
    jacket: [toValidatedMesh(negative!), toValidatedMesh(positive!)],
    siliconeVolumeMm3, siliconeKg: siliconeVolumeMm3 / 1e6 * density,
    cavityBounds: { min, max },
  };
}

/**
 * Weld on a 0.0001mm grid after Float32 conversion, removing collapsed face
 * pairs. Displacement ≤ 0.000087mm; final topology is always revalidated.
 */
function barrierMesh(man: ManifoldT): Mesh {
  const mesh = fromManifold(man);
  const points: number[][] = [];
  const parents: number[] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    points.push([mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!].map((v) => Math.round(v * 10000) / 10000));
    parents.push(i / 3);
  }
  const root = (i: number): number => {
    while (parents[i] !== i) { parents[i] = parents[parents[i]!]!; i = parents[i]!; }
    return i;
  };
  // Only weld collapsed mesh EDGES. Coincident but topologically separate
  // surfaces must not be welded: doing so can create a four-face edge.
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const tri = [mesh.indices[i]!, mesh.indices[i + 1]!, mesh.indices[i + 2]!];
    for (let k = 0; k < 3; k++) {
      const a = tri[k]!, b = tri[(k + 1) % 3]!;
      if (points[a]!.every((v, j) => v === points[b]![j])) parents[root(b)] = root(a);
    }
  }
  const unique = new Map<number, number>();
  const vertices: number[] = [];
  const remap = points.map((_, i) => {
    const key = root(i);
    let index = unique.get(key);
    if (index === undefined) { index = vertices.length / 3; unique.set(key, index); vertices.push(...points[key]!); }
    return index;
  });
  const indices: number[] = [];
  const faces = new Map<string, [number, number, number]>();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = remap[mesh.indices[i]!]!, b = remap[mesh.indices[i + 1]!]!, c = remap[mesh.indices[i + 2]!]!;
    if (a !== b && b !== c && c !== a) {
      const key = [a, b, c].sort((x, y) => x - y).join(',');
      if (faces.has(key)) faces.delete(key); // collapsed zero-thickness face pair
      else faces.set(key, [a, b, c]);
    }
  }
  for (const face of faces.values()) indices.push(...face);
  const result: Mesh = { ...mesh, positions: new Float32Array(vertices), indices: new Uint32Array(indices) };
  const report = validateMesh(result);
  if (!report.ok) throw new Error(`BARRIER_MESH_INVALID: ${report.problems.join(',')}`);
  return result;
}

export interface OffsetBarrierOptions {
  /** Optional integrated clamp flange and three top ports (experimental). */
  casting?: { flangeMm?: number; sprueDia?: number; ventDia?: number; boltHoleDia?: number };
  clearanceMm?: number;
  thicknessMm?: number;
  /** Sphere tessellation; bounded so radial offset approximation stays below 0.2mm. */
  segments?: number;
}

export interface OffsetBarrierResult {
  halves: [Mesh, Mesh];
  casting?: {
    flangeMm: number;
    fasteners: {
      holeDia: number;
      axis: 'z';
      centers: [number, number, number][];
      /** Thickness of both flange halves together, excludes washers/nuts. */
      gripMm: number;
      edgeClearanceMm: number;
    };
    ports: { center: [number, number, number]; diameter: number; removedVolumeMm3: number }[];
  };
  clearanceMm: number;
  thicknessMm: number;
  /** Conservative radial error from the faceted spherical dilation tool. */
  offsetErrorBoundMm: number;
}

/**
 * Separate, conformal barrier prototype: (master ⊕ sphere(clearance+thickness))
 * minus (master ⊕ sphere(clearance)), split at bbox mid-Z for removal.
 * Unlike a bbox scale this follows concave features, which may close if narrower
 * than twice the offset. Optional casting adds a flange and top ports;
 * mechanical release is NOT guaranteed by the split or mesh validation.
 */
export async function buildOffsetBarrier(master: Mesh, opts: OffsetBarrierOptions = {}): Promise<OffsetBarrierResult> {
  const clearance = opts.clearanceMm ?? 2;
  const thickness = opts.thicknessMm ?? 2;
  const segments = opts.segments ?? 32;
  if (![clearance, thickness].every((v) => Number.isFinite(v) && v > 0) ||
      !Number.isInteger(segments) || segments < 16 || segments > 64 || segments % 4 !== 0) {
    throw new Error('BARRIER_INVALID_OPTIONS');
  }
  // Angular span in each of the two spherical directions ≤ 2π/segments.
  // cos²(pi/segments) bounds the inscribed facets' radial loss conservatively.
  const offsetErrorBoundMm = (clearance + thickness) * (1 - Math.cos(Math.PI / segments) ** 2) + 0.0011;
  if (offsetErrorBoundMm > 0.2) throw new Error('BARRIER_OFFSET_TOLERANCE');
  if (opts.casting && ![opts.casting.flangeMm ?? 15, opts.casting.sprueDia ?? 12, opts.casting.ventDia ?? 4, opts.casting.boltHoleDia ?? 4.5]
    .every((n) => Number.isFinite(n) && n > 0)) throw new Error('BARRIER_INVALID_CASTING');
  if (opts.casting && (opts.casting.flangeMm ?? 15) < 2 * ((opts.casting.boltHoleDia ?? 4.5) + 2)) {
    throw new Error('BARRIER_FLANGE_TOO_NARROW_FOR_BOLTS');
  }
  const report = validateMesh(master);
  if (!report.ok) throw new Error(`BARRIER_INVALID_MASTER: ${report.problems.join(',')}`);
  await initCsg();
  const w = requireWasm();
  const owned: ManifoldT[] = [];
  const own = (m: ManifoldT) => { owned.push(m); return m; };
  try {
    const man = own(toManifold(master));
    const innerSphere = own(w.Manifold.sphere(clearance, segments));
    const outerSphere = own(w.Manifold.sphere(clearance + thickness, segments));
    const inner = own(man.minkowskiSum(innerSphere));
    const outer = own(man.minkowskiSum(outerSphere));
    let shell = own(outer.subtract(inner));
    const bb = man.boundingBox();
    let casting: OffsetBarrierResult['casting'];
    if (opts.casting) {
      const flange = opts.casting.flangeMm ?? 15;
      const sprue = opts.casting.sprueDia ?? 12;
      const vent = opts.casting.ventDia ?? 4;
      const midZ = (bb.min[2] + bb.max[2]) / 2;
      const reach = clearance + thickness + flange;
      const slab = own(w.Manifold.cube([
        bb.max[0] - bb.min[0] + 2 * reach,
        bb.max[1] - bb.min[1] + 2 * reach,
        2 * thickness,
      ], false));
      const flangeSolid = own(slab.translate([bb.min[0] - reach, bb.min[1] - reach, midZ - thickness]));
      const ring = own(flangeSolid.subtract(inner));
      shell = own(shell.add(ring));
      // Select well-separated actual top vertices, never bbox points over empty space.
      const candidates: [number, number, number][] = [];
      for (let i = 0; i < master.positions.length; i += 3) {
        if (Math.abs(master.positions[i + 1]! - bb.max[1]) < 0.001) {
          candidates.push([master.positions[i]!, bb.max[1], master.positions[i + 2]!]);
        }
      }
      const distance = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);
      const chosen: [number, number, number][] = [];
      if (candidates.length) chosen.push(candidates[0]!);
      while (chosen.length < 3) {
        let best: [number, number, number] | undefined, bestDistance = -1;
        for (const candidate of candidates) {
          const d = Math.min(...chosen.map((p) => distance(p, candidate)));
          if (d > bestDistance) { best = candidate; bestDistance = d; }
        }
        if (!best || bestDistance < (sprue + vent) / 2 + thickness) throw new Error('BARRIER_TOP_PORTS_DO_NOT_FIT');
        chosen.push(best);
      }
      const ports: NonNullable<OffsetBarrierResult['casting']>['ports'] = [];
      for (let i = 0; i < chosen.length; i++) {
        const center = chosen[i]!;
        const diameter = i === 0 ? sprue : vent;
        const cyl = own(w.Manifold.cylinder(reach + 2, diameter / 2, diameter / 2, 32, false));
        const upright = own(cyl.rotate([-90, 0, 0]));
        const tool = own(upright.translate([center[0], center[1] - 1, center[2]]));
        const removedVolumeMm3 = own(shell.intersect(tool)).volume();
        if (removedVolumeMm3 <= 0) throw new Error('BARRIER_PORT_NOT_CONNECTED');
        shell = own(shell.subtract(tool));
        ports.push({ center, diameter, removedVolumeMm3 });
      }
      // Four axial through-holes in the external corner regions of the flange.
      // A quarter flange inset keeps holes clear of both the cavity and the edge.
      const holeDia = opts.casting.boltHoleDia ?? 4.5;
      const inset = flange / 4;
      const centers: [number, number, number][] = [];
      for (const x of [bb.min[0] - reach + inset, bb.max[0] + reach - inset]) {
        for (const y of [bb.min[1] - reach + inset, bb.max[1] + reach - inset]) {
          const center: [number, number, number] = [x, y, midZ];
          const cyl = own(w.Manifold.cylinder(2 * thickness + 2, holeDia / 2, holeDia / 2, 32, false));
          const tool = own(cyl.translate([x, y, midZ - thickness - 1]));
          const material = own(shell.intersect(tool)).volume();
          const expected = Math.PI * (holeDia / 2) ** 2 * 2 * thickness;
          if (material < expected * 0.98) throw new Error('BARRIER_BOLT_NOT_IN_SOLID_FLANGE');
          shell = own(shell.subtract(tool));
          centers.push(center);
        }
      }
      casting = {
        flangeMm: flange, ports,
        fasteners: { holeDia, axis: 'z', centers, gripMm: 2 * thickness, edgeClearanceMm: inset - holeDia / 2 },
      };
    }
    const pieces = shell.splitByPlane([0, 0, 1], (bb.min[2] + bb.max[2]) / 2);
    pieces.forEach(own);
    return {
      halves: [barrierMesh(own(pieces[1]!.simplify(0.001))), barrierMesh(own(pieces[0]!.simplify(0.001)))],
      clearanceMm: clearance, thicknessMm: thickness, offsetErrorBoundMm, casting,
    };
  } finally {
    // Minkowski operations create large native allocations; release even on validation failure.
    for (let i = owned.length - 1; i >= 0; i--) owned[i]!.delete?.();
  }
}

/** Human-readable assembly metadata; not a mechanical certification. */
export function motherAssemblyGuide(result: OffsetBarrierResult): string {
  const lines = [
    'راهنمای مونتاژ مادرقالب هم‌فاصله — آزمایشی',
    'واحد همهٔ مختصات و اندازه‌ها: mm؛ مختصات همان مختصات مونتاژی STL است.',
    `فاصلهٔ اسمی از قطعه: ${result.clearanceMm} | ضخامت اسمی پوسته: ${result.thicknessMm}`,
    `کران خطای تقریب offset: ${result.offsetErrorBoundMm.toFixed(4)}`,
    'دو نیمه بدون تغییر مقیاس صادر می‌شوند؛ جهت بازشدن پیشنهادی در راستای منفی/مثبت Z است.',
    'اعتبار مش به معنی تأیید جدایش مکانیکی نیست. گیرکردن قطعه و جزئیات باریک را بررسی کنید.',
  ];
  const casting = result.casting;
  if (casting) {
    const bolts = casting.fasteners;
    lines.push(
      `فلنج: ${casting.flangeMm} | تعداد سوراخ پیچ: ${bolts.centers.length} | قطر سوراخ عبوری: ${bolts.holeDia}`,
      `محور سوراخ‌ها: ${bolts.axis.toUpperCase()} | ضخامت مجموع دو فلنج: ${bolts.gripMm}`,
      `حداقل فاصلهٔ لبهٔ سوراخ تا لبهٔ بیرونی فلنج: ${bolts.edgeClearanceMm.toFixed(3)}`,
      'پیچ، مهره و واشر جزو STL نیستند؛ قطر و طول پیچ را با تلرانس پرینت، واشر و مهره انتخاب کنید.',
      'سوراخ‌ها رزوه ندارند. از واشر استفاده کنید؛ سفت‌کردن بیش از حد می‌تواند فلنج را بشکند.',
    );
    bolts.centers.forEach((p, i) => lines.push(`پیچ ${i + 1}: (${p.map((v) => v.toFixed(3)).join(', ')})`));
    casting.ports.forEach((port, i) => lines.push(
      `${i === 0 ? 'دهانهٔ ریختن' : `هواکش ${i}`}: قطر ${port.diameter} | مبدأ (${port.center.map((v) => v.toFixed(3)).join(', ')}) | راستای +Y`,
    ));
  }
  lines.push(
    'پیش از ریختن: دو نیمه را خشک مونتاژ و هم‌راستایی سوراخ‌ها و بازبودن راهگاه‌ها را بررسی کنید.',
    'آب‌بندی خودکار یا شیار واشر در این خروجی وجود ندارد؛ درز و سطوح پرینت را با روش سازگار با ماده آب‌بندی کنید.',
    'جداکنندهٔ سطح مناسب ماده به کار ببرید؛ ابتدا تست نشتی و جدایش روی نمونهٔ کم‌حجم انجام دهید.',
    'این فایل تأیید تحمل فشار، بار پیچ، عدم نشتی یا قابلیت تولید نیست.',
  );
  return lines.join('\n');
}
