import { formatNumber } from './number-format';
import { BUNDLE_LIMITS } from '@patturn/exporters';

/** Known exporter failures get actionable Persian text; preserve unknown diagnostics. */
export function zipErrorMessage(error: unknown): string {
  const diagnostic = error instanceof Error ? error.message : String(error);
  const code = diagnostic.replace(/^Error:\s*/, '').split(':', 1)[0];
  switch (code) {
    case 'EXPORT_CANCELLED':
      return 'بسته‌بندی لغو شد؛ فایلی دانلود نشد.';
    case 'BUNDLE_TOO_MANY_FILES':
      return `تعداد فایل‌های بسته بیشتر از سقف ${formatNumber(BUNDLE_LIMITS.files)} است؛ فایل‌های کمتری را در هر بسته قرار دهید.`;
    case 'BUNDLE_FILE_TOO_LARGE':
      return `یکی از فایل‌ها بزرگ‌تر از سقف ${formatNumber(BUNDLE_LIMITS.fileBytes / 1024 / 1024)} MiB است؛ جزئیات مش یا اندازهٔ فایل جانبی را کاهش دهید.`;
    case 'BUNDLE_TOTAL_TOO_LARGE':
      return `مجموع فایل‌های غیرفشرده بیشتر از ${formatNumber(BUNDLE_LIMITS.totalBytes / 1024 / 1024)} MiB است؛ خروجی‌ها را در بسته‌های کوچک‌تر تهیه کنید.`;
    case 'BUNDLE_PATH_CONFLICT':
      return 'مسیر یک فایل هم‌زمان به‌عنوان پوشه استفاده شده است؛ نام یا پوشهٔ فایل‌های بسته را تغییر دهید.';
    case 'BUNDLE_DUPLICATE_PATH':
      return 'دو فایل در بسته نام یکسان دارند؛ نام‌ها را حتی از نظر حروف بزرگ/کوچک و شکل Unicode متمایز کنید.';
    case 'BUNDLE_UNSAFE_PATH':
      return 'یکی از مسیرهای بسته برای استخراج امن مناسب نیست؛ از نام نسبی بدون مسیر والد یا نام رزروشدهٔ ویندوز استفاده کنید.';
    default:
      return dxfErrorMessage(error);
  }
}

/** Presentation only: exporter codes and machine data remain unchanged. */
export function dxfErrorMessage(error: unknown): string {
  const diagnostic = error instanceof Error ? error.message : String(error);
  const code = diagnostic.replace(/^Error:\s*/, '').split(':', 1)[0];
  switch (code) {
    case 'DXF_PATH_LIMIT':
      return 'تعداد مسیرهای DXF بیش از حد مجاز است؛ طرح را به چند فایل تقسیم کنید.';
    case 'DXF_PATH_CHARACTER_LIMIT':
      return 'دادهٔ مسیرهای DXF بیش از حد طولانی است؛ مسیرها را ساده یا جداگانه صادر کنید.';
    case 'DXF_VERTEX_LIMIT':
    case 'DXF_BEZIER_COMPLEXITY_LIMIT':
    case 'DXF_ARC_COMPLEXITY_LIMIT':
      return 'جزئیات طرح برای خروجی DXF بیش از حد است؛ مسیرها را ساده کنید یا از SVG استفاده کنید.';
    case 'DXF_ARC_REQUIRES_EXPLICIT_TOLERANCE':
    case 'DXF_CUBIC_REQUIRES_EXPLICIT_TOLERANCE':
    case 'DXF_QUADRATIC_REQUIRES_EXPLICIT_TOLERANCE':
      return 'برای تقریب منحنی در DXF باید تلرانس مشخص شود؛ از SVG استفاده کنید یا تنظیمات صادرکننده را بررسی کنید.';
    case 'DXF_BEZIER_TOLERANCE_NOT_REACHED':
      return 'تقریب منحنی به دقت خواسته‌شده نرسید؛ مسیر را ساده کنید یا از SVG استفاده کنید.';
    case 'DXF_INVALID_BEZIER_TOLERANCE':
    case 'DXF_INVALID_BEZIER_OPTIONS_OR_COORDINATES':
    case 'DXF_INVALID_ARC_OPTIONS':
      return 'تلرانس یا مختصات منحنی DXF معتبر نیست؛ پارامترهای طرح و تنظیمات تقریب را بررسی کنید.';
    case 'DXF_ARC_COORDINATE_LIMIT':
    case 'DXF_ARC_RADIUS_LIMIT':
    case 'DXF_ARC_NUMERIC_LIMIT':
      return 'ابعاد یا محاسبات کمان از محدودهٔ امن DXF خارج است؛ ابعاد و شعاع کمان را کاهش دهید.';
    case 'DXF_INVALID_BOUNDS':
      return 'ابعاد بوم DXF باید مثبت و متناهی باشد؛ عرض و ارتفاع طرح را بررسی کنید.';
    case 'DXF_EMPTY_DRAWING':
    case 'DXF_EMPTY_PATH':
    case 'DXF_DEGENERATE_SUBPATH':
      return 'طرح DXF مسیر قابل‌ترسیم ندارد یا زیرمسیر آن ناقص است؛ مسیر دارای دست‌کم دو نقطه بسازید.';
    case 'DXF_INVALID_ARC_FLAG':
      return 'پرچم جهت یا اندازهٔ کمان SVG نامعتبر است؛ هر پرچم باید صفر یا یک باشد.';
    case 'DXF_INVALID_SEPARATOR':
      return 'جداکنندهٔ مسیر SVG نامعتبر است؛ ویرگول اضافی یا کنار فرمان را حذف کنید.';
    case 'DXF_INVALID_CLOSE':
    case 'DXF_MISSING_MOVE':
      return 'ترتیب فرمان‌های مسیر SVG معتبر نیست؛ هر مسیر باید با فرمان حرکت M آغاز شود.';
    case 'DXF_INVALID_NUMBER':
    case 'DXF_INVALID_PATH':
      return 'مسیر SVG دارای عدد، نویسه یا آرگومان نامعتبر است؛ دادهٔ مسیر را اصلاح کنید.';
    case 'DXF_UNSUPPORTED_COMMAND':
      return 'یکی از فرمان‌های مسیر در DXF پشتیبانی نمی‌شود؛ مسیر را ساده کنید یا از SVG استفاده کنید.';
    default:
      return diagnostic;
  }
}
