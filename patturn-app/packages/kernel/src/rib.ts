import type { Mesh } from './revolve.js';

/** Extrude a monotone inside-rib contact edge against the x=0 backing plane.
 * Shared band vertices prevent T-junctions even on collinear backing edges.
 * Input coordinates are mm, ordered from high Y to low Y, as in the 2D template.
 */
export function buildRibMesh(
  contact: readonly (readonly [number, number])[],
  thicknessMm: number,
): Mesh {
  if (!Number.isFinite(thicknessMm) || thicknessMm < 1 || thicknessMm > 12)
    throw Error('RIB_INVALID_THICKNESS');
  if (contact.length < 2 || contact.length > 512) throw Error('RIB_CONTACT_LIMIT');
  for (let i = 0; i < contact.length; i++) {
    const [x, y] = contact[i]!;
    if (
      !Number.isFinite(x) ||
      x < 5 ||
      x > 1000 ||
      !Number.isFinite(y) ||
      y < 0 ||
      y > 1000 ||
      (i > 0 && contact[i - 1]![1] - y < 0.001)
    )
      throw Error('RIB_INVALID_CONTACT');
  }
  const positions = new Float32Array(contact.length * 12);
  const indices: number[] = [];
  contact.forEach(([x, y], i) =>
    positions.set([0, y, 0, x, y, 0, 0, y, thicknessMm, x, y, thicknessMm], i * 12),
  );
  for (let i = 0; i < contact.length - 1; i++) {
    const a = i * 4,
      b = a + 1,
      c = a + 4,
      d = a + 5;
    indices.push(
      a,
      b,
      c,
      b,
      d,
      c, // z=0
      a + 2,
      c + 2,
      b + 2,
      b + 2,
      c + 2,
      d + 2, // z=thickness
      a,
      c,
      a + 2,
      c,
      c + 2,
      a + 2, // backing
      b,
      b + 2,
      d,
      d,
      b + 2,
      d + 2, // contact edge
    );
  }
  const end = (contact.length - 1) * 4;
  indices.push(0, 2, 1, 1, 2, 3, end, end + 1, end + 2, end + 1, end + 3, end + 2);
  return { positions, indices: new Uint32Array(indices) };
}
