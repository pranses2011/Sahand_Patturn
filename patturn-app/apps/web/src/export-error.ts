import { BUNDLE_LIMITS } from '@patturn/exporters';

/** Known exporter failures get actionable Persian text; preserve unknown diagnostics. */
export function zipErrorMessage(error: unknown): string {
  const diagnostic = error instanceof Error ? error.message : String(error);
  const code = diagnostic.replace(/^Error:\s*/, '').split(':', 1)[0];
  switch (code) {
    case 'EXPORT_CANCELLED':
      return 'بسته‌بندی لغو شد؛ فایلی دانلود نشد.';
    case 'BUNDLE_TOO_MANY_FILES':
      return `تعداد فایل‌های بسته بیشتر از سقف ${BUNDLE_LIMITS.files} است؛ فایل‌های کمتری را در هر بسته قرار دهید.`;
    case 'BUNDLE_FILE_TOO_LARGE':
      return `یکی از فایل‌ها بزرگ‌تر از سقف ${BUNDLE_LIMITS.fileBytes / 1024 / 1024} MiB است؛ جزئیات مش یا اندازهٔ فایل جانبی را کاهش دهید.`;
    case 'BUNDLE_TOTAL_TOO_LARGE':
      return `مجموع فایل‌های غیرفشرده بیشتر از ${BUNDLE_LIMITS.totalBytes / 1024 / 1024} MiB است؛ خروجی‌ها را در بسته‌های کوچک‌تر تهیه کنید.`;
    case 'BUNDLE_PATH_CONFLICT':
      return 'مسیر یک فایل هم‌زمان به‌عنوان پوشه استفاده شده است؛ نام یا پوشهٔ فایل‌های بسته را تغییر دهید.';
    case 'BUNDLE_DUPLICATE_PATH':
      return 'دو فایل در بسته نام یکسان دارند؛ نام‌ها را حتی از نظر حروف بزرگ/کوچک و شکل Unicode متمایز کنید.';
    case 'BUNDLE_UNSAFE_PATH':
      return 'یکی از مسیرهای بسته برای استخراج امن مناسب نیست؛ از نام نسبی بدون مسیر والد یا نام رزروشدهٔ ویندوز استفاده کنید.';
    default:
      return diagnostic;
  }
}
