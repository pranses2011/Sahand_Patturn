import { buildRibMesh } from '@patturn/kernel';
import { SHEET } from './dimensions.js';
/** Same monotone contact edge as the solid; no scaling or normal-offset approximation. */
export function ribPdfLayout(contact: readonly (readonly [number, number])[], thickness: number) {
  buildRibMesh(contact, thickness); // share bounded geometry validation with STL
  const width = Math.max(...contact.map((p) => p[0]));
  const minY = contact.at(-1)![1],
    maxY = contact[0]![1];
  const columns = Math.ceil(width / SHEET.tileWidthMm);
  const rows = Math.ceil((maxY - minY) / SHEET.tileHeightMm);
  const tiles = Array.from({ length: rows * columns }, (_, i) => {
    const column = i % columns,
      row = Math.floor(i / columns);
    return {
      column,
      row,
      xMin: column * SHEET.tileWidthMm,
      xMax: (column + 1) * SHEET.tileWidthMm,
      yMin: minY + row * SHEET.tileHeightMm,
      yMax: minY + (row + 1) * SHEET.tileHeightMm,
    };
  });
  return { width, height: maxY - minY, minY, maxY, tiles };
}
