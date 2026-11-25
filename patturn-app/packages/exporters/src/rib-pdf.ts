import { ribPdfLayout } from './rib-pdf-layout.js';
export { ribPdfLayout } from './rib-pdf-layout.js';
import { formatNumber } from '@patturn/config';
import { clipProfileLine, SHEET } from './dimensions.js';
import { exportName, type ExportResult } from './index.js';

export async function toRibPdf(
  inputContact: readonly (readonly [number, number])[],
  thickness: number,
  signal?: AbortSignal,
): Promise<ExportResult> {
  try {
    const cancelled = () => {
      if (signal?.aborted) throw Error('EXPORT_CANCELLED');
    };
    cancelled();
    if (inputContact.length > 512) throw Error('RIB_CONTACT_LIMIT');
    // Snapshot all mutable geometry before the dynamic imports/yields.
    const contact = inputContact.map(([x, y]) => [x, y] as [number, number]);
    const layout = ribPdfLayout(contact, thickness);
    const [{ jsPDF }, { VAZIRMATN_BASE64 }] = await Promise.all([
      import('jspdf'),
      import('./fonts/vazirmatn.js'),
    ]);
    cancelled();
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: false, precision: 5 });
    pdf.setCreationDate(new Date('2000-01-01T00:00:00Z'));
    pdf.setFileId('00000000000000000000000000000002');
    pdf.setProperties({
      title: 'Patturn rib template',
      author: 'Patturn',
      subject: 'A4 1:1 mm rib',
    });
    pdf.addFileToVFS('Vazirmatn.ttf', VAZIRMATN_BASE64);
    pdf.addFont('Vazirmatn.ttf', 'Vazirmatn', 'normal');
    pdf.setFont('Vazirmatn');
    const fa = (text: string, y: number, size = 9) => {
      pdf.setFontSize(size);
      pdf.setR2L(false);
      pdf.text(text, 195, y, { align: 'right' });
    };
    const outline: [number, number][] = [
      ...contact,
      [0, layout.minY],
      [0, layout.maxY],
      contact[0]!,
    ];
    for (let i = 0; i < layout.tiles.length; i++) {
      if (signal)
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
      cancelled();
      if (i) pdf.addPage();
      const tile = layout.tiles[i]!;
      fa('الگوی ریب ـ چاپ در اندازهٔ واقعی ۱۰۰٪', 14, 13);
      fa(
        `صفحهٔ ردیف ${formatNumber(tile.row + 1)}، ستون ${formatNumber(tile.column + 1)} ـ واحد mm`,
        23,
      );
      fa(
        `عرض ${formatNumber(layout.width, 2)}؛ ارتفاع ${formatNumber(layout.height, 2)}؛ ضخامت ${formatNumber(thickness, 2)} mm`,
        30,
        8,
      );
      const draw = (a: [number, number], b: [number, number]) => {
        const line = clipProfileLine(a, b, tile);
        if (line)
          pdf.line(
            15 + line[0] - tile.xMin,
            35 + line[1] - tile.yMin,
            15 + line[2] - tile.xMin,
            35 + line[3] - tile.yMin,
          );
      };
      pdf.setDrawColor(210);
      pdf.setLineWidth(0.1);
      pdf.rect(15, 35, SHEET.tileWidthMm, SHEET.tileHeightMm);
      for (let x = Math.ceil(tile.xMin / 10) * 10; x <= tile.xMax; x += 10)
        draw([x, tile.yMin], [x, tile.yMax]);
      for (let y = Math.ceil(tile.yMin / 10) * 10; y <= tile.yMax; y += 10)
        draw([tile.xMin, y], [tile.xMax, y]);
      pdf.setDrawColor(0);
      pdf.setLineWidth(0.35);
      for (let j = 1; j < outline.length; j++) draw(outline[j - 1]!, outline[j]!);
      // Page frames/grid are assembly aids, not additional cutting boundaries.
      fa('کادرها را لب‌به‌لب بچینید؛ شبکه و کادر، خط برش نیستند.', 270, 8);
      pdf.line(15, 280, 115, 280);
      for (let mm = 0; mm <= 100; mm += 10) pdf.line(15 + mm, 280, 15 + mm, 277);
      fa('خط‌کش ۱۰۰ mm؛ جا دادن در صفحه خاموش ـ بدون جبران انقباض و لقی', 290, 8);
    }
    cancelled();
    return {
      ok: true,
      filename: exportName('rib', 'template', 'A4-1to1', 'pdf'),
      bytes: new Uint8Array(pdf.output('arraybuffer')),
    };
  } catch (error) {
    return { ok: false, filename: '', error: String(error) };
  }
}
