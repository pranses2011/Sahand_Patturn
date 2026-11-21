/**
 * CSG boolean via manifold-3d (WASM) — ADR-001 primary kernel.
 * mold = block − form (scaled by 1/(1−shrink)); split by plane; keys added.
 * Async init (WASM load) → call initCsg() once at app startup.
 */
import type { Mesh } from '@patturn/kernel';
import { validateMesh } from '@patturn/kernel';

type ManifoldT = {
  volume(): number;
  genus(): number;
  numTri(): number;
  getMesh(): { triVerts: Uint32Array; vertProperties: Float32Array; numProp: number };
  subtract(o: ManifoldT): ManifoldT;
  add(o: ManifoldT): ManifoldT;
  intersect(o: ManifoldT): ManifoldT;
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
}

/** Solid block around the form: w+2wall, d+2wall, h+base+wall (site spec). */
export function buildBlock(opts: BlockOptions): ManifoldT {
  const w = requireWasm();
  const wall = opts.wall ?? 25;
  const base = opts.base ?? 20;
  const bw = opts.max[0] - opts.min[0] + wall * 2;
  const bd = opts.max[2] - opts.min[2] + wall * 2;
  const bh = opts.max[1] - opts.min[1] + base + wall;
  const cx = (opts.min[0] + opts.max[0]) / 2;
  const cz = (opts.min[2] + opts.max[2]) / 2;
  const box = w.Manifold.cube([bw, bh, bd], false);
  // cube(size, false) spans [0,size] — shift so it is centered on X/Z and sits below the form
  return box.translate([cx - bw / 2, opts.min[1] - base, cz - bd / 2]);
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

/** Registration key: tapered cylinder along +Y (site: r=8, h=10, taper 4°). */
export function makeKeyMale(r = 8, h = 10, taperDeg = 4): ManifoldT {
  const w = requireWasm();
  const rTop = r + h * Math.tan((taperDeg * Math.PI) / 180);
  // manifold cylinder is along Z — rotate to Y so height maps to Y
  return w.Manifold.cylinder(h, r, rTop, 32, false).rotate([-90, 0, 0]);
}

/** Female socket = male + clearance (site default 0.2mm radial). */
export function makeKeyFemale(r = 8, h = 10, taperDeg = 4, clearance = 0.2): ManifoldT {
  return makeKeyMale(r + clearance, h + clearance, taperDeg);
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
): [ManifoldT, ManifoldT] {
  let a = partA;
  let b = partB;
  for (const pos of positions) {
    const male = makeKeyMale(r, h, taperDeg).translate(pos);
    const female = makeKeyFemale(r, h, taperDeg, clearance).translate(pos);
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
  const block = buildBlock({ min: bb.min, max: bb.max, wall: opts?.wall, base: opts?.base });
  const mold = block.subtract(man); // man is already a ManifoldT
  return toValidatedMesh(mold);
}
