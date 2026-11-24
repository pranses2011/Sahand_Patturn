import { describe, expect, it } from 'vitest';
import { ribPdfLayout, toRibPdf } from './rib-pdf.js';
const contact: [number, number][] = [
  [30, 104],
  [50, 60],
  [20, 0],
];
const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);
describe('Rib A4 actual-size PDF', () => {
  it('embeds the offline font, real A4 page and an exact 100mm control ruler', async () => {
    const result = await toRibPdf(contact, 4);
    expect(result.ok, result.error).toBe(true);
    const pdf = text(result.bytes!);
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(1);
    expect(pdf).toContain('/MediaBox [0 0 595.28 841.89]');
    expect(pdf).toContain('/FontFile2');
    const ruler = [...pdf.matchAll(/([\d.]+) ([\d.]+) m\n([\d.]+) ([\d.]+) l/g)].find(
      (m) =>
        Math.abs(Number(m[1]) - (15 * 72) / 25.4) < 0.001 &&
        Math.abs(Number(m[3]) - (115 * 72) / 25.4) < 0.001 &&
        Math.abs(Number(m[2]) - (17 * 72) / 25.4) < 0.001,
    );
    expect(ruler).toBeDefined();
    expect(((Number(ruler![3]) - Number(ruler![1])) * 25.4) / 72).toBeCloseTo(100, 4);
  });
  it('tiles without scaling and keeps the same origin at shared boundaries', async () => {
    const large: [number, number][] = [
      [200, 500],
      [400, 250],
      [200, 0],
    ];
    const layout = ribPdfLayout(large, 4);
    expect(layout.tiles).toHaveLength(9);
    expect(layout.tiles[0]!.xMax).toBe(layout.tiles[1]!.xMin);
    expect(layout.tiles[0]!.yMax).toBe(layout.tiles[3]!.yMin);
    const result = await toRibPdf(large, 4);
    expect(text(result.bytes!).match(/\/Type \/Page\b/g)).toHaveLength(9);
  });
  it('draws contact geometry in mm without mirroring or fitting', async () => {
    const pdf = text((await toRibPdf(contact, 4)).bytes!);
    const segments = [...pdf.matchAll(/([\d.]+) ([\d.]+) m\n([\d.]+) ([\d.]+) l/g)];
    const found = segments.some((m) =>
      [45, 297 - 139, 65, 297 - 95].every(
        (v, i) => Math.abs(Number(m[i + 1]) - (v * 72) / 25.4) < 0.001,
      ),
    );
    expect(found).toBe(true);
  });
  it('produces deterministic bytes with and without a live signal', async () => {
    expect((await toRibPdf(contact, 4)).bytes).toEqual(
      (await toRibPdf(contact, 4, new AbortController().signal)).bytes,
    );
  });
  it('snapshots mutable input before imports and page yields', async () => {
    const input = structuredClone(contact);
    const pending = toRibPdf(input, 4);
    input[0]![0] = 80;
    input.push([10, -10]);
    expect((await pending).bytes).toEqual((await toRibPdf(contact, 4)).bytes);
  });
  it('rejects pre-cancelled requests without bytes', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await toRibPdf(contact, 4, controller.signal);
    expect(result.error).toContain('EXPORT_CANCELLED');
    expect(result.bytes).toBeUndefined();
  });
  it('discards partial output when cancellation arrives during a page yield', async () => {
    const controller = new AbortController();
    const pending = toRibPdf(contact, 4, controller.signal);
    const timer = setTimeout(() => controller.abort(), 0);
    const result = await pending;
    clearTimeout(timer);
    expect(result.error).toContain('EXPORT_CANCELLED');
    expect(result.bytes).toBeUndefined();
  });
  it.each([
    { points: [], thickness: 4 },
    { points: contact, thickness: 0 },
    {
      points: [
        [NaN, 100],
        [20, 0],
      ] as [number, number][],
      thickness: 4,
    },
    {
      points: Array.from({ length: 513 }, (_, i) => [20, 513 - i] as [number, number]),
      thickness: 4,
    },
  ])(
    'rejects invalid or excessive geometry without a partial file %#',
    async ({ points, thickness }) => {
      const result = await toRibPdf(points, thickness);
      expect(result.ok).toBe(false);
      expect(result.bytes).toBeUndefined();
    },
  );
});
