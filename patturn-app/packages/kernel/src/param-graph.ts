/**
 * ParamGraph — DAG of parameters with memoization and dirty propagation.
 * Iron rule: deterministic — same inputs always same outputs (no Math.random without seed).
 */
export type ParamValue = number | boolean | string;

export interface ParamNode {
  id: string;
  type: 'input' | 'derive';
  value?: ParamValue;
  derive?: (inputs: Record<string, ParamValue>) => ParamValue;
  inputs: string[];
  unit?: 'mm' | 'deg' | '%' | 'ml' | 'kg';
  constraint?: { min?: number; max?: number; step?: number };
  label?: string;
}

export class ParamGraph {
  private nodes = new Map<string, ParamNode>();
  private cache = new Map<string, ParamValue>();
  private listeners = new Set<(id: string) => void>();

  add(node: ParamNode): void {
    if (this.nodes.has(node.id)) throw new Error(`duplicate node: ${node.id}`);
    if (node.type === 'derive' && !node.derive)
      throw new Error(`derive node without fn: ${node.id}`);
    this.nodes.set(node.id, node);
  }

  has(id: string): boolean {
    return this.nodes.has(id);
  }

  set(id: string, v: ParamValue): void {
    const n = this.nodes.get(id);
    if (!n) throw new Error(`unknown node: ${id}`);
    if (n.type !== 'input') throw new Error(`cannot set derive node: ${id}`);
    if (typeof v === 'number' && n.constraint) {
      if (n.constraint.min !== undefined && v < n.constraint.min) v = n.constraint.min;
      if (n.constraint.max !== undefined && v > n.constraint.max) v = n.constraint.max;
    }
    if (n.value === v) return;
    n.value = v;
    this.invalidate(this.dirty(id));
    for (const cb of this.listeners) cb(id);
  }

  get(id: string): ParamValue {
    const n = this.nodes.get(id);
    if (!n) throw new Error(`unknown node: ${id}`);
    if (n.type === 'input') {
      if (n.value === undefined) throw new Error(`input node has no value: ${id}`);
      return n.value;
    }
    const key = `${id}@${n.inputs.map((i) => `${i}=${this.get(i)}`).join(',')}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const inputs: Record<string, ParamValue> = {};
    for (const i of n.inputs) inputs[i] = this.get(i);
    const out = n.derive!(inputs);
    this.cache.set(key, out);
    return out;
  }

  /** Node ids affected (transitively) by a change to `id`. */
  dirty(id: string): Set<string> {
    const affected = new Set<string>([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of this.nodes.values()) {
        if (!affected.has(n.id) && n.inputs.some((i) => affected.has(i))) {
          affected.add(n.id);
          grew = true;
        }
      }
    }
    return affected;
  }

  private invalidate(ids: Set<string>): void {
    for (const id of ids) {
      for (const key of [...this.cache.keys()]) {
        if (key.startsWith(`${id}@`) || key === id || key.startsWith(`${id}=`))
          this.cache.delete(key);
      }
      // cache keys embed node id as prefix "<deriveId>@..." — drop all entries for dirty derive nodes
      for (const key of [...this.cache.keys()]) {
        const deriveId = key.split('@')[0] ?? '';
        if (ids.has(deriveId)) this.cache.delete(key);
      }
    }
  }

  onChange(cb: (id: string) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  serialize(): Record<string, ParamValue> {
    const out: Record<string, ParamValue> = {};
    for (const n of this.nodes.values()) if (n.type === 'input') out[n.id] = n.value!;
    return out;
  }

  hydrate(snap: Record<string, ParamValue>): void {
    for (const [id, v] of Object.entries(snap)) {
      if (this.nodes.has(id)) this.set(id, v);
    }
  }
}
