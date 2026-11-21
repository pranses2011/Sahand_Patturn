import type { Profile } from '@patturn/kernel';
import { exportName, type ExportResult } from './index.js';

export const MAX_PDF_PROFILE_POINTS = 10_000;
export const MAX_PDF_COORDINATE_MM = 10_000_000;
export const SHEET = { widthMm: 210, heightMm: 297, marginMm: 15, topMm: 35, tileWidthMm: 180, tileHeightMm: 230 } as const;
export interface ProfileTile { column: number; row: number; xMin: number; xMax: number; yMin: number; yMax: number }

/** Global profile coordinates in mm; no fit-to-page scaling. */
export function dimensionSheetLayout(profile: Profile): { diameterMm: number; heightMm: number; tiles: ProfileTile[] } {
  if (profile.length > MAX_PDF_PROFILE_POINTS) throw new Error('PDF_TOO_MANY_POINTS');
  if (profile.length < 2 || profile.some((p, i) => !Number.isFinite(p.r) || !Number.isFinite(p.y) || p.r > MAX_PDF_COORDINATE_MM || Math.abs(p.y) > MAX_PDF_COORDINATE_MM || p.r < 0 || (i > 0 && p.y < profile[i - 1]!.y))) {
    throw new Error('PDF_INVALID_PROFILE');
  }
  let radius = 0;
  for (const point of profile) radius = Math.max(radius, point.r);
  const yMin = profile[0]!.y, yMax = profile[profile.length - 1]!.y;
  if (radius <= 0 || yMax <= yMin) throw new Error('PDF_EMPTY_PROFILE');
  const columns = Math.ceil(2 * radius / SHEET.tileWidthMm), rows = Math.ceil((yMax - yMin) / SHEET.tileHeightMm);
  if (columns * rows > 100) throw new Error('PDF_TOO_MANY_PAGES');
  const tiles: ProfileTile[] = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const xMin = -radius + column * SHEET.tileWidthMm;
    const top = yMax - row * SHEET.tileHeightMm;
    tiles.push({ column, row, xMin, xMax: xMin + SHEET.tileWidthMm, yMin: top - SHEET.tileHeightMm, yMax: top });
  }
  return { diameterMm: 2 * radius, heightMm: yMax - yMin, tiles };
}

/** Liang–Barsky clipping, preserving original metric coordinates. */
export function clipProfileLine(a: [number, number], b: [number, number], tile: ProfileTile): [number, number, number, number] | null {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [a[0] - tile.xMin, tile.xMax - a[0], a[1] - tile.yMin, tile.yMax - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i]! < 0) return null; continue; }
    const t = q[i]! / p[i]!;
    if (p[i]! < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [a[0] + t0 * dx, a[1] + t0 * dy, a[0] + t1 * dx, a[1] + t1 * dy];
}

export async function toDimensionPdf(inputProfile: Profile, inputOptions: {
  project?: string;
  signal?: AbortSignal;
  parameters?: { label: string; value: string }[];
} = {}): Promise<ExportResult> {
  try {
    if (inputProfile.length > MAX_PDF_PROFILE_POINTS) throw new Error('PDF_TOO_MANY_POINTS');
    // Snapshot before the first await: callers retain ownership of mutable arrays.
    const options = {
      project: inputOptions.project,
      signal: inputOptions.signal,
      parameters: inputOptions.parameters?.slice(0, 12).map((row) => ({
        label: row.label.slice(0, 50), value: row.value.slice(0, 80),
      })),
    };
    const cancelled = () => { if (options.signal?.aborted) throw new Error('EXPORT_CANCELLED'); };
    cancelled();
    const profile = inputProfile.map((point) => ({ ...point }));
    const layout = dimensionSheetLayout(profile);
    // Keep PDF engine and embedded font out of the initial editor bundle.
    const [{ jsPDF }, { VAZIRMATN_BASE64 }] = await Promise.all([
      import('jspdf'), import('./fonts/vazirmatn.js'),
    ]);
    cancelled();
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: false, precision: 5 });
    pdf.setCreationDate(new Date('2000-01-01T00:00:00Z'));
    pdf.setFileId('00000000000000000000000000000001');
    pdf.setProperties({ title: 'Patturn dimension sheet', author: 'Patturn', subject: 'A4 1:1 mm profile' });
    pdf.addFileToVFS('Vazirmatn.ttf', VAZIRMATN_BASE64);
    pdf.addFont('Vazirmatn.ttf', 'Vazirmatn', 'normal');
    pdf.setFont('Vazirmatn');
    const fa = (text: string, y: number, size = 11) => {
      pdf.setFontSize(size); pdf.setR2L(false); pdf.text(text, 195, y, { align: 'right' });
    };
    const latin = (text: string, x: number, y: number, size = 9) => { pdf.setFontSize(size); pdf.text(text, x, y); };
    const ruler = () => {
      pdf.setDrawColor(0); pdf.setLineWidth(0.3);
      // Exactly 100mm, regardless of profile size or tile count.
      pdf.line(15, 280, 115, 280);
      for (let i = 0; i <= 100; i += 10) {
        pdf.line(15 + i, 280, 15 + i, 280 - (i % 50 === 0 ? 4 : 2));
        latin(String(i), 14 + i, 286, 7);
      }
      latin('100 mm / Print: Actual size 100%', 15, 292, 8);
    };
    fa('برگهٔ ابعاد و پروفیل', 18, 16);
    fa((options.project ?? 'پروژه').slice(0, 60), 29);
    fa('واحد میلی‌متر؛ چاپ روی کاغذ آ۴ با اندازهٔ واقعی', 43);
    fa('گزینهٔ جا دادن در صفحه را خاموش کنید و خط‌کش را اندازه بگیرید.', 52);
    fa('پروفیل مربوط به فرم نهایی است؛ جبران انقباض روی این ترسیم اعمال نشده است.', 61, 10);
    const rows = [
      { label: 'قطر بیشینه', value: `${layout.diameterMm.toFixed(3)} mm` },
      { label: 'ارتفاع کل', value: `${layout.heightMm.toFixed(3)} mm` },
      { label: 'مقیاس ترسیم', value: '1:1' },
      { label: 'صفحات الگو', value: String(layout.tiles.length) },
      ...(options.parameters ?? []).slice(0, 12),
    ];
    rows.forEach((row, i) => {
      const y = 78 + i * 10;
      fa(row.label.slice(0, 50), y);
      latin(row.value.slice(0, 80), 20, y, 10);
      pdf.setDrawColor(210); pdf.setLineWidth(0.1); pdf.line(15, y + 3, 195, y + 3);
    });
    fa('برای فرم بزرگ، کادر صفحات بعدی را لب‌به‌لب کنار هم بچینید.', 253, 10);
    fa('نقشهٔ پروفیل است، نه الگوی بازشدهٔ اسلب یا تأیید ساخت.', 262, 10);
    ruler();
    for (const tile of layout.tiles) {
      // Yield between pages so browser UI/input can deliver a cancellation request.
      if (options.signal) await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
      cancelled();
      pdf.addPage();
      fa('پروفیل با مقیاس واقعی ـ شبکهٔ ده میلی‌متری', 15, 14);
      latin(`Tile row ${tile.row + 1}, col ${tile.column + 1} | 1:1 mm`, 15, 24);
      latin(`Origin X=${tile.xMin.toFixed(3)} Y(top)=${tile.yMax.toFixed(3)}`, 15, 30, 8);
      pdf.setDrawColor(200); pdf.setLineWidth(0.1);
      pdf.rect(15, 35, SHEET.tileWidthMm, SHEET.tileHeightMm);
      const draw = (a: [number, number], b: [number, number]) => {
        const line = clipProfileLine(a, b, tile);
        if (line) pdf.line(15 + line[0] - tile.xMin, 35 + tile.yMax - line[1], 15 + line[2] - tile.xMin, 35 + tile.yMax - line[3]);
      };
      // Metric grid, continuous across tile boundaries.
      for (let x = Math.ceil(tile.xMin / 10) * 10; x <= tile.xMax; x += 10) draw([x, tile.yMin], [x, tile.yMax]);
      for (let y = Math.ceil(tile.yMin / 10) * 10; y <= tile.yMax; y += 10) draw([tile.xMin, y], [tile.xMax, y]);
      pdf.setDrawColor(0); pdf.setLineWidth(0.35);
      for (let i = 1; i < profile.length; i++) {
        const a = profile[i - 1]!, b = profile[i]!;
        draw([a.r, a.y], [b.r, b.y]); draw([-a.r, a.y], [-b.r, b.y]);
      }
      ruler();
    }
    cancelled();
    return { ok: true, filename: exportName(options.project ?? 'profile', 'dimensions', 'A4-1to1', 'pdf'), bytes: new Uint8Array(pdf.output('arraybuffer')) };
  } catch (error) { return { ok: false, filename: '', error: String(error) }; }
}
