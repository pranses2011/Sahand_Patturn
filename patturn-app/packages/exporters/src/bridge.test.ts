import { it, expect } from 'vitest';
import DxfParser from 'dxf-parser';
import { bridgeIsland } from '@patturn/patterns';
import { toSvg, toDxf } from './index.js';
it('exports the real bridged contour as one closed SVG path and independently readable DXF', () => {
  const out = bridgeIsland(
    [
      [
        [0, 0],
        [40, 0],
        [40, 40],
        [0, 40],
      ],
      [
        [10, 10],
        [30, 10],
        [30, 30],
        [10, 30],
      ],
    ],
    1,
    2,
  );
  const svg = toSvg(out.paths, 40, 40);
  expect(svg.ok).toBe(true);
  expect((new TextDecoder().decode(svg.bytes).match(/<path /g) ?? []).length).toBe(1);
  const dxf = toDxf(out.paths, { width: 40, height: 40 });
  expect(dxf.ok).toBe(true);
  const doc = new DxfParser().parseSync(new TextDecoder().decode(dxf.bytes))!;
  expect(doc.entities.length).toBeGreaterThan(8);
  expect(doc.entities.every((item) => item.type === 'LINE')).toBe(true);
});
