import { useId } from 'react';

export type HelpTopic = 'segments' | 'wall' | 'shrink' | 'fill' | 'tile';
const HELP: Record<HelpTopic, { title: string; text: string; drawing: string }> = {
  segments: { title: 'تقسیمات دور فرم', text: 'سگمنت بیشتر، سطح گرد را نرم‌تر می‌کند ولی تعداد مثلث‌ها و زمان محاسبه را افزایش می‌دهد. ابعاد اسمی ثابت می‌مانند؛ مش خروجی تقریب چندضلعی سطح است.', drawing: 'مقایسهٔ شش‌ضلعی و دایره برای نمایش تقریب سطح گرد' },
  wall: { title: 'ضخامت در محاسبهٔ ظرفیت', text: 'برای تخمین ظرفیت، این مقدار از شعاع کم و کف به همین اندازه بالا برده می‌شود. این روش آفست عمود بر سطح نیست. تغییر آن، STL فرم بیرونی توپر را توخالی نمی‌کند.', drawing: 'برش شماتیک بدنه و کف ضخیم پیرامون فضای داخلی' },
  shrink: { title: 'انقباض خطی', text: 'ابعاد خشک برابر اندازهٔ فعلی ضرب‌در یک منهای درصد انقباض است. در ساخت قالب، جبران با تقسیم بر همین ضریب انجام می‌شود. مثلاً برای ۱۰٪ انقباض، طول ۱۰۰ میلی‌متر به ۹۰ می‌رسد و برای هدف ۱۰۰ باید حدود ۱۱۱٫۱ ساخته شود.', drawing: 'مقایسهٔ طول اولیه و طول کوچک‌تر پس از خشک‌شدن' },
  fill: { title: 'ارتفاع پرشدگی', text: 'این درصد، ارتفاع پرشدگی از کف فضای داخلی تا دهانه است، نه درصد حجم کل. در فرم‌های گشاد یا باریک‌شونده، ۸۰٪ ارتفاع لزوماً ۸۰٪ ظرفیت نیست.', drawing: 'سطح افقی مایع در بخشی از ارتفاع ظرف' },
  tile: { title: 'اندازهٔ کاشی الگو', text: 'اندازهٔ تکرار الگو بر حسب میلی‌متر است. مقدار کوچک‌تر، تکرارهای بیشتری روی بوم ثابت ۳۰۰ در ۳۰۰ ایجاد می‌کند. خروجی SVG اندازهٔ واقعی دارد؛ برای چاپ، مقیاس را ۱۰۰٪ نگه دارید.', drawing: 'شبکهٔ تکرار کاشی و عرض یک خانه' },
};

export function ParameterHelp({ topic }: { topic: HelpTopic }) {
  const id = useId();
  const help = HELP[topic];
  return <details className="parameter-help">
    <summary>راهنما: {help.title}</summary>
    <div className="parameter-help-content">
      <svg viewBox="0 0 180 90" role="img" aria-labelledby={id}>
        <title id={id}>{`${help.drawing}؛ شماتیک و بدون مقیاس`}</title>
        <g fill="none" stroke="currentColor" strokeWidth="2">
          {topic === 'segments' && <><path d="M50 12 80 29 80 61 50 78 20 61 20 29Z" /><circle cx="130" cy="45" r="33" /></>}
          {topic === 'wall' && <><path d="M40 10V78H140V10M50 10V67H130V10" /><path d="M40 44H50M44 40 40 44 44 48M46 40 50 44 46 48" /></>}
          {topic === 'shrink' && <><path d="M20 15H160V39H20ZM20 55H146V75H20Z" /><path d="m158 51-8 7 8 7M150 58H170" /></>}
          {topic === 'fill' && <><path d="M40 10 52 78H128L140 10" /><path d="M47 48H133L128 78H52Z" fill="currentColor" opacity="0.2" /><path d="M47 48H133M152 10V78M147 10H157M147 48H157M147 78H157" /></>}
          {topic === 'tile' && <><path d="M30 10H150V70H30ZM60 10V70M90 10V70M120 10V70M30 40H150M60 80H90M60 76V84M90 76V84" /><path d="M60 10H90V40H60Z" fill="currentColor" opacity="0.2" /></>}
        </g>
      </svg>
      <p>{help.text}</p>
      <small>تصویر شماتیک است؛ نقشهٔ ساخت نیست.</small>
    </div>
  </details>;
}
