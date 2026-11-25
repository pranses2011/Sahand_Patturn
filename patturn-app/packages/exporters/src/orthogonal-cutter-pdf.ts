import type { CutterPoint, ConvexCutterOptions } from '@patturn/kernel';
import { orthogonalCutterPdfLayout } from './orthogonal-cutter-pdf-layout.js';
export { orthogonalCutterPdfLayout } from './orthogonal-cutter-pdf-layout.js';
import { formatNumber } from '@patturn/config';
import { exportName, type ExportResult } from './index.js';
export async function toOrthogonalCutterPdf(
  input: readonly CutterPoint[],
  options: ConvexCutterOptions,
  signal?: AbortSignal,
): Promise<ExportResult> {
  try {
    const cancelled = () => {
      if (signal?.aborted) throw Error('EXPORT_CANCELLED');
    };
    cancelled();
    if (input.length > 65) throw Error('ORTHOGONAL_PDF_LIMIT');
    const points = input.map(([x, y]): CutterPoint => [x, y]),
      settings = { heightMm: options.heightMm, wallMm: options.wallMm, tipMm: options.tipMm };
    const layout = orthogonalCutterPdfLayout(points, settings);
    const [{ jsPDF }, { VAZIRMATN_BASE64 }] = await Promise.all([
      import('jspdf'),
      import('./fonts/vazirmatn.js'),
    ]);
    cancelled();
    if (signal)
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    cancelled();
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: false, precision: 5 });
    pdf.setCreationDate(new Date('2000-01-01T00:00:00Z'));
    pdf.setFileId('00000000000000000000000000000003');
    pdf.setProperties({
      title: 'Patturn orthogonal cutter boundary',
      author: 'Patturn',
      subject: 'A4 1:1 mm inner contour',
    });
    pdf.addFileToVFS('Vazirmatn.ttf', VAZIRMATN_BASE64);
    pdf.addFont('Vazirmatn.ttf', 'Vazirmatn', 'normal');
    pdf.setFont('Vazirmatn');
    pdf.setR2L(false);
    const fa = (text: string, y: number, size = 9) => {
      pdf.setFontSize(size);
      pdf.text(text, 195, y, { align: 'right' });
    };
    fa('مرز داخلی کاتر قائم‌الزاویه ـ مقیاس واقعی ۱۰۰٪', 14, 13);
    fa(`عرض ${formatNumber(layout.width, 2)}؛ عمق ${formatNumber(layout.height, 2)} mm`, 24);
    fa(
      `ارتفاع ${formatNumber(settings.heightMm)}؛ دیواره ${formatNumber(settings.wallMm)}؛ لبه ${formatNumber(settings.tipMm)} mm`,
      32,
      8,
    );
    fa('فقط مرز داخلی؛ نه دستگیره، دیواره یا نقشهٔ ساخت سه‌بعدی', 40, 8);
    pdf.setDrawColor(0);
    pdf.setLineWidth(0.3);
    for (let i = 0; i < layout.points.length; i++) {
      const a = layout.points[i]!,
        b = layout.points[(i + 1) % layout.points.length]!;
      pdf.line(25 + a[0], 50 + a[1], 25 + b[0], 50 + b[1]);
    }
    fa('چاپ در اندازهٔ واقعی؛ گزینهٔ جا دادن در صفحه را خاموش کنید.', 262, 9);
    fa('بدون جبران انقباض، لقی یا تأیید ایمنی و استحکام؛ اندازه را کنترل کنید.', 270, 8);
    pdf.line(15, 280, 115, 280);
    for (let mm = 0; mm <= 100; mm += 10) pdf.line(15 + mm, 280, 15 + mm, 277);
    fa('خط‌کش کنترل ۱۰۰ mm؛ پیش از استفاده با خط‌کش واقعی بسنجید.', 290, 8);
    cancelled();
    return {
      ok: true,
      filename: exportName('orthogonal-cutter', 'inner-boundary', 'A4-1to1', 'pdf'),
      bytes: new Uint8Array(pdf.output('arraybuffer')),
    };
  } catch (error) {
    return { ok: false, filename: '', error: String(error) };
  }
}
