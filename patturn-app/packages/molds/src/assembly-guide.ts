import type { OffsetBarrierResult } from './csg.js';

/** Human-readable assembly metadata; not a mechanical certification. */
export function motherAssemblyGuide(result: OffsetBarrierResult): string {
  const lines = [
    'راهنمای مونتاژ مادرقالب هم‌فاصله — آزمایشی',
    'واحد همهٔ مختصات و اندازه‌ها: mm؛ مختصات همان مختصات مونتاژی STL است.',
    `فاصلهٔ اسمی از قطعه: ${result.clearanceMm} | ضخامت اسمی پوسته: ${result.thicknessMm}`,
    `کران خطای تقریب offset: ${result.offsetErrorBoundMm.toFixed(4)}`,
    'دو نیمه بدون تغییر مقیاس صادر می‌شوند؛ جهت بازشدن پیشنهادی در راستای منفی/مثبت Z است.',
    'اعتبار مش به معنی تأیید جدایش مکانیکی نیست. گیرکردن قطعه و جزئیات باریک را بررسی کنید.',
  ];
  if (result.release) {
    lines.push(
      'بررسی نمونه‌ای مسیر بازشدن در راستای Z — بدون تأیید پیوستهٔ جدایش',
      `فاصله‌های بررسی‌شده: ${result.release.samplesMm.map((n) => n.toFixed(3)).join(', ')}`,
      `آستانهٔ حجم برخورد: ${result.release.volumeToleranceMm3} mm³`,
    );
    result.release.halves.forEach((half, i) =>
      lines.push(
        `نیمهٔ ${i + 1} (${half.direction}): ${half.status === 'collision-detected' ? `برخورد در فاصلهٔ ${half.firstCollisionMm}mm` : 'در نمونه‌ها برخوردی دیده نشد؛ تضمین جدایش نیست'} | حداکثر همپوشانی با قطعه ${half.maxMasterOverlapMm3.toFixed(3)} و نیمهٔ مقابل ${half.maxOtherHalfOverlapMm3.toFixed(3)} mm³`,
      ),
    );
  } else
    lines.push(
      `مسیر بازشدن برای این خروجی بررسی نشده است.${result.releaseError ? ` خطا: ${result.releaseError}` : ''}`,
    );
  const casting = result.casting;
  if (casting) {
    const bolts = casting.fasteners;
    lines.push(
      `فلنج: ${casting.flangeMm} | تعداد سوراخ پیچ: ${bolts.centers.length} | قطر سوراخ عبوری: ${bolts.holeDia}`,
      `محور سوراخ‌ها: ${bolts.axis.toUpperCase()} | ضخامت مجموع دو فلنج: ${bolts.gripMm}`,
      `حداقل فاصلهٔ لبهٔ سوراخ تا لبهٔ بیرونی فلنج: ${bolts.edgeClearanceMm.toFixed(3)}`,
      'پیچ، مهره و واشر جزو STL نیستند؛ قطر و طول پیچ را با تلرانس پرینت، واشر و مهره انتخاب کنید.',
      'سوراخ‌ها رزوه ندارند. از واشر استفاده کنید؛ سفت‌کردن بیش از حد می‌تواند فلنج را بشکند.',
    );
    bolts.centers.forEach((p, i) =>
      lines.push(`پیچ ${i + 1}: (${p.map((v) => v.toFixed(3)).join(', ')})`),
    );
    casting.ports.forEach((port, i) =>
      lines.push(
        `${i === 0 ? 'دهانهٔ ریختن' : `هواکش ${i}`}: قطر ${port.diameter} | مبدأ (${port.center.map((v) => v.toFixed(3)).join(', ')}) | راستای +Y`,
      ),
    );
  }
  lines.push(
    'پیش از ریختن: دو نیمه را خشک مونتاژ و هم‌راستایی سوراخ‌ها و بازبودن راهگاه‌ها را بررسی کنید.',
    'آب‌بندی خودکار یا شیار واشر در این خروجی وجود ندارد؛ درز و سطوح پرینت را با روش سازگار با ماده آب‌بندی کنید.',
    'جداکنندهٔ سطح مناسب ماده به کار ببرید؛ ابتدا تست نشتی و جدایش روی نمونهٔ کم‌حجم انجام دهید.',
    'این فایل تأیید تحمل فشار، بار پیچ، عدم نشتی یا قابلیت تولید نیست.',
  );
  return lines.join('\n');
}
