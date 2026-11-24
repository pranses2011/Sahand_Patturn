import { describe, expect, it } from 'vitest';
import { buildRibMesh } from './rib.js';
import { validateMesh } from './mesh-validate.js';
const contacts: [number, number][][] = [
  [
    [20, 100],
    [20, 0],
  ],
  [
    [30, 104],
    [50, 60],
    [20, 0],
  ],
  Array.from({ length: 512 }, (_, i) => [20 + 10 * Math.sin(i / 20), 511 - i]),
];
describe('Monotone rib extrusion', () => {
  it.each(contacts.flatMap((contact) => [1, 4, 12].map((thickness) => ({ contact, thickness }))))(
    'is closed, consistently wound and matches trapezoidal area %#',
    ({ contact, thickness }) => {
      const mesh = buildRibMesh(contact, thickness);
      const report = validateMesh(mesh);
      expect(report.ok, report.problems.join(',')).toBe(true);
      expect(report.euler).toBe(2);
      expect(report.openEdges).toBe(0);
      const area = contact
        .slice(1)
        .reduce((sum, [x, y], i) => sum + ((x + contact[i]![0]) * (contact[i]![1] - y)) / 2, 0);
      expect(Math.abs(report.signedVolumeMm3 - area * thickness) / (area * thickness)).toBeLessThan(
        1e-6,
      );
      expect(mesh.positions.length / 3).toBe(contact.length * 4);
      const z = Array.from(mesh.positions).filter((_, i) => i % 3 === 2);
      expect(Math.min(...z)).toBe(0);
      expect(Math.max(...z)).toBe(thickness);
    },
  );
  it('is deterministic without modifying caller contact data', () => {
    const contact = contacts[1]!;
    const before = structuredClone(contact);
    expect(buildRibMesh(contact, 4)).toEqual(buildRibMesh(contact, 4));
    expect(contact).toEqual(before);
  });
  it.each([0, 0.99, 12.01, NaN, Infinity])('rejects thickness %s', (thickness) => {
    expect(() => buildRibMesh(contacts[0]!, thickness)).toThrow('RIB_INVALID_THICKNESS');
  });
  it.each(
    [
      [],
      [[20, 0]],
      [
        [20, 0],
        [20, 100],
      ],
      [
        [20, 0],
        [20, 0],
      ],
      [
        [20, 1],
        [20, 0.9999],
      ],
      [
        [4, 100],
        [20, 0],
      ],
      [
        [1001, 100],
        [20, 0],
      ],
      [
        [20, NaN],
        [20, 0],
      ],
      [
        [20, 1001],
        [20, 0],
      ],
      [
        [20, 100],
        [20, -1],
      ],
      [
        [Infinity, 100],
        [20, 0],
      ],
      Array.from({ length: 513 }, (_, i) => [20, 513 - i]),
    ].map((contact) => ({ contact })),
  )('rejects invalid contact geometry %#', ({ contact }) => {
    expect(() => buildRibMesh(contact as [number, number][], 4)).toThrow(/RIB_/);
  });
});

it('uses every shared edge in opposite directions and all vertices in the closed solid', () => {
  const mesh = buildRibMesh(contacts[2]!, 4);
  const balance = new Map<string, number>();
  const used = new Set<number>();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const face = Array.from(mesh.indices.slice(i, i + 3));
    for (let e = 0; e < 3; e++) {
      const a = face[e]!,
        b = face[(e + 1) % 3]!;
      used.add(a);
      const key = `${Math.min(a, b)},${Math.max(a, b)}`;
      balance.set(key, (balance.get(key) ?? 0) + (a < b ? 1 : -1));
    }
  }
  expect([...balance.values()].every((v) => v === 0)).toBe(true);
  expect(used.size).toBe(mesh.positions.length / 3);
});
