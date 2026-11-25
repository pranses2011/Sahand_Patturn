# ۱۶ — تحلیل مستند SolidVents و قرارداد گسترش Patturn

تاریخ بررسی: 2026-11-20 (UTC). نسخهٔ مبنای کد: `90b7c06` / 0.2.0. این سند **برنامهٔ توسعه است نه اعلام پیاده‌سازی**. دامنهٔ آن علاوه بر تمام نیازمندی‌های قبلی سفال، قالب، ابزار، وب و ویندوز است، نه جایگزین آن‌ها.

## ۱. روش، منابع و مرز اطمینان

محتوای متنی صفحات عمومی زیر مستقیم خوانده شد؛ صفحهٔ اصلی سه بخش، تاریخچه پنج بخش، آموزش دو بخش، AI دو بخش و حریم خصوصی سه بخش داشت. هیچ حسابی ساخته نشد، خرید/ورود/ارسال فایل انجام نشد و خروجی CAD مرجع آزمایش نشده است. صفحهٔ app فقط quick start، شمار نقاط و Hole Ratio را به خوانش متن ارائه کرد؛ Wrap صفحهٔ ورود STEP و سه نمونه را نشان داد. پس «مستند در سایت» با «آزموده‌شدهٔ عملی» یکسان نیست. صفحهٔ `/guides/en` در زمان بررسی قابل واکشی نبود. گالری فقط برای شناسایی وجود کتابخانه دیده شد؛ presetها، عکس‌ها و طرح‌ها دانلود یا بازنشر نشوند.

| منبع | URL | مدرک و کاربرد |
|---|---|---|
| S01 اصلی | https://solidvents.com/ | ۹ چیدمان، تصویر، بردار، STEP، Wrap و کاربردها |
| S02 FAQ | https://solidvents.com/faq/en | گرادیان، لایه، ذخیره، Performance، حساب و پلن |
| S03 آموزش | https://solidvents.com/tutorial/en | تعامل، sync، morph، جهت جریان، split، mirror |
| S04 تاریخچه | https://solidvents.com/changelog/en | تغییرات تا 2026.11.14، حذف Plate with Holes، PNG و رگرسیون‌ها |
| S05 Wrap | https://solidvents.com/guides/wrap/en | flatten، distortion، پروفایل، عمق، STEP |
| S06 ادیتور | https://solidvents.com/app?from=site | quick start، Points و Hole Ratio؛ تعامل عملی بررسی نشده |
| S07 برنامهٔ Wrap | https://solidvents.com/wrap/ | ورودی STEP، نمونهٔ تخت/گنبد/دوانحنا و شاخص‌ها |
| S08 گالری | https://solidvents.com/explore/en | کتابخانه و deep link به marketplace؛ شمار قطعی/مجوز طرح‌ها تأیید نشد |
| S09 پلن | https://solidvents.com/pricing/en | Free، Pro، split، draft، API و marketplace |
| S10 AI | https://solidvents.com/ai/en | MCP، REST، AI Custom، preview و لینک ویرایش |
| S11 حریم خصوصی | https://solidvents.com/privacy/en | local-first، cloud، گزارش اختیاری، لاگ و retention |
| S12 شرایط | https://solidvents.com/terms/en | مالکیت، محدودیت ساخت، حقوق preset و منع کپی محصول |
| S13 هافتون | https://solidvents.com/guides/photo-to-halftone | luminance، invert، contrast، جای‌گذاری تصویر |

**احتیاط حقوقی:** پیاده‌سازی مستقل با تکیه بر مسئله/رفتار عمومی، ریاضیات عمومی و نیاز کاربر؛ کد، لوگو، متن UI، ویدئو، preset، الگوی اختصاصی و دارایی مرجع کپی نشود. شرایط S12 صریحاً کپی سرویس و بازتوزیع preset را منع می‌کند؛ پیش از سازگاری فایل اختصاصی یا عرضهٔ تجاری بررسی حقوقی لازم است. هیچ endpoint خصوصی یا روش دورزدن پرداخت/سهمیه استفاده نشود.

## ۲. جمع‌بندی فنی و اصلاح برداشت‌های نادرست

SolidVents یک سازندهٔ پارامتریک الگو در مرورگر است، نه شبیه‌ساز حرارت/آکوستیک یا تضمین‌کنندهٔ استحکام. مدل ذهنی آن: Boundary + Layout + Unit Shapes + Controllers → هندسهٔ مشترک پیش‌نمایش و خروجی. Wrap مسیر جداگانهٔ STEP → انتخاب وجه → flatten → pattern → بازگردانی به سطح است.

- S01 «۹ حالت» را معرفی می‌کند: Random، Grid، Path، Spiral، Concentric، Fibonacci، Cross-hatch، Voronoi Stone، Flow Lines. **AI Custom** در S04/S10 حالت افزودهٔ مجزا است؛ نباید در شمار ۹ گم شود.
- S01 فقط SVG/DXF/STEP را برجسته می‌کند؛ **PNG شفاف** طبق S04 از 2026.10.01 وجود دارد؛ باید در دامنه باشد.
- خروجی STEP مرجع از 2026.06.01 **Shapes Only** است؛ گزینهٔ قدیمی Plate with Holes حذف شده است. ساخت صفحهٔ سوراخ‌دار در Patturn نیاز مستقل با گیت اعتبار است، نه ادعای برابری با قابلیت فعلی مرجع.
- «Fixed» در S03 و تاریخچهٔ 09.20 به معنی عدم morph توصیف شده، ولی اصلاح 09.23 و 09.28 می‌گوید Fixed فقط اندازه/زاویه/چگالی را نادیده می‌گیرد و **اگر target دارد morph می‌شود**. تصمیم Patturn: قرارداد آخرین تاریخچه مبنا و در UI شفاف شود؛ تابع تبدیل کل مجموعه همیشه بر همهٔ لایه‌ها اعمال شود.
- خروجی برداری یا STEP معتبر، به‌تنهایی مدرک ساخت‌پذیری، مجوز تجاری طرح واردشده، ایمنی غذا یا استحکام نیست.
- «پردازش محلی» به معنی «بدون شبکه در همهٔ مسیرها» نیست: S11 شمارش خروجی، analytics، cloud و API را توضیح می‌دهد. Patturn ردیابی اثرانگشت دستگاه را اقتباس نمی‌کند؛ دسکتاپ محلی بدون سهمیهٔ آنلاین باید کار کند.
- مستندات مرجع برای نحوهٔ ترکیب چند کنترلر، همهٔ فرمول‌ها، تحمل CAD و همهٔ سقف‌های تعاملی کافی نیستند؛ قراردادهای زیر انتخاب مهندسی مستقل Patturn هستند، نه کشف الگوریتم خصوصی.

## ۳. ماتریس پوشش قابل‌ردگیری

وضعیت «بخشی» فقط وجود قابلیت مرتبط در کد 0.2.0 است، نه برابری نهایی. هر ردیف یک نیاز مستقل؛ زیرجزئیات هم الزام‌اند. ستون پذیرش حداقل لازم برای بستن ردیف است. مالک‌ها نقش هستند، نه افراد استخدام‌شده.

| ID | دامنه و رفتار الزامی | منبع | وضعیت مبنا / پذیرش تکمیل | وابستگی / مالک |
|---|---|---|---|---|
| SV-01 | مدل پروژهٔ الگو: mm، seed، نسخهٔ الگوریتم، layout مستقل از shape/boundary/controllers | S01–03 | بخشی؛ تغییر حالت بدون ازبین‌رفتن شکل/کنترلر، مهاجرت و undo roundtrip | schema / FE+GE |
| SV-02 | Random scatter با jitter و seed، بازتولید roll | S01 | بخشی؛ seed برابر بایت برابر، عدم وابستگی به ساعت/Math.random | 01 / GE |
| SV-03 | Grid مربعی/شش‌ضلعی، offset، rotation، Cross-Row Spin بر Row/Column/Both | S03–04 | بخشی؛ spin فقط جهت واحد را عوض کند نه مرکز آن | 01 / GE |
| SV-04 | Path با مسیر قابل‌ویرایش، فاصلهٔ طول‌قوس و Rotate to Path | S01–03 | باز؛ خط/قوس/Bezier، فاصله و مماس با تلورانس ثبت‌شده | 01,13 / GE |
| SV-05 | Spiral، Concentric و Fibonacci؛ rotate-to-path در دو اول، حذف نقطهٔ مرکزی نامتناسب | S01,04 | باز؛ مرز بیرونی و شمار نقاط و seed بدون پرش | 01 / GE |
| SV-06 | Cross-hatch با کنترل دو جهت، گام و چرخش | S01 | باز؛ پیش‌نمایش و بردار هم‌هندسه | 01 / GE |
| SV-07 | Voronoi stone: اندازه، بی‌نظمی، crack width، fillet، rotation و reseed | S04 | بخشی؛ اندازه→عرض ترک، spacing→چگالی؛ angle/shape نامربوط غیرفعال | 01,15 / GE |
| SV-08 | Flow Lines: width/spacing/bend، rotation و سه cap تخت/گرد/مرزی | S01,03–04 | باز؛ خط خارج range صاف و cap گرد در مرز چرخیده سالم | 10,15 / GE |
| SV-09 | Flow Direction تک‌کنترلر خط/curve/closed، امتداد مماسی، corner fillet و Invert Lines & Gaps | S03–04 | باز؛ جایگزینی کنترلر، حلقه/تقاطع و جزایر سالم؛ ممنوعیت گزینه‌های ناپیوسته در spacing/bend | 08,13 / GE |
| SV-10 | مرز مستطیل/گرد/چندضلعی/دلخواه، Complete Area در برابر Boundary Clipping، حفره و جزیره | S01,04 | بخشی؛ تست کل منحنی نه فقط anchor، tangency، notch و همپوشانی | 13,15 / GE |
| SV-11 | سبک واحد circle/rectangle/polygon/star با نسبت ابعاد، گوشه و محور W/H | S02–03 | بخشی؛ واحد واقعی و تبدیل کامل با حالت چیدمان | 01 / GE+FE |
| SV-12 | ادیتور Select/Direct Select/Pen، anchor و handle، primitive dimension dialog، اندازه/چرخش/مرکز/تکثیر/لایه | S02–04 | باز؛ Undo/Redo، میانبر، ویرایش دقیق و عدم تغییر سند تا Apply | 13 / FE |
| SV-13 | واردسازی امن SVG/DXF و مرز/مسیر دلخواه در اندازهٔ اصلی، arc/Bezier، fill rule | S02–04 | باز؛ parser محدود، scale فقط با تأیید، خطای فارسی برای entity ناسازگار | 01 / GE |
| SV-14 | لایه‌های Normal/Union/Subtract؛ group/independent/fixed، pivot و قفل W/H/radius | S02–04 | باز؛ transform کل گروه بر fixed هم اعمال شود؛ تشخیص مرز مستقل برای هر لایه | 12,15 / GE |
| SV-15 | هندسهٔ مشترک بستهٔ برداری، union همپوشانی، winding و حذف قطعات منحط | S04 | بخشی؛ preview/SVG/DXF/STEP از یک snapshot، تلورانس آشکار و رگرسیون جزیره | 13 / GE |
| SV-16 | fillet غیرمخرب و قابل‌بازویرایش، محدودسازی شعاع و قفل شعاع | S02–04 | باز؛ reopen/scale/export شعاع یکسان؛ collapse خطای ساختاریافته | 12,15 / GE |
| SV-17 | Mirror زنده ۲–۱۲ نسخه، reflection در ۲ و radial در بالاتر، Apply و دوخت انتهای روی محور | S03 | باز؛ metadata تا Apply حفظ، مسیر باز و target قرارداد مشخص | 12,14 / GE+FE |
| SV-18 | Smart Snap به لبه/مرکز/محور آینه با راهنما و Ctrl موقت | S04 | باز؛ snap در مقیاس صفحه، رفتار لمس/قلم و keyboard جایگزین | 12 / FE |
| SV-19 | کنترلر Point/Line/Curve/Polyline/Closed برای Size/Spacing/Angle/Shape | S02–03 | باز؛ فاصلهٔ هندسی mm، target/range مستقل، select و ویرایش مستقیم | 01,13 / GE+FE |
| SV-20 | advanced: Fill Closed، Hard Edge، Single Side+flip، Infinite Extension، Symmetric Angle و stepped increment | S03–04 | باز؛ نقطه/بسته بدون side/extension؛ ناسازگاری‌ها صریح، صفر increment پیوسته | 19 / GE |
| SV-21 | Sync هندسه میان کانال‌ها، Unify Range، Unified Value، حذف همگام بدون alias mutable | S03–04 | باز؛ هندسه مشترک و target مستقل، انتخاب کوچک‌ترین محدودهٔ مناسب | 19 / FE+GE |
| SV-22 | Random Dropout با نرخ، near/edge/uniform، seed و hard-edge | S03–04 | باز؛ فقط داخل range، seed پایدار با تغییر ترتیب ارزیابی | 19–20 / GE |
| SV-23 | تصویر پس‌زمینه: opacity/scale/position، luminance controller برای چهار کانال، invert/contrast | S01,03,13 | باز؛ decode محلی محدود، جهت و alpha و خارج تصویر تعریف‌شده، بازیابی پروژه | 01,19 / GE+FE |
| SV-24 | morph اشکال built-in و custom base/target با topology/anchor order برابر | S03–04 | باز؛ target بدون افزودن anchor/import/boolean؛ تغییر base target را با هشدار reset کند | 12,14,19 / GE |
| SV-25 | morph صحیح دوران و pivot و fillet و mirror؛ copy/paste/undo و Fixed مطابق آخرین قرارداد | S04 | باز؛ دوران ۱۸۰ درجه در نیمه collapse نکند؛ حرکت rigid arc و target هر لایه حفظ شود | 24 / GE |
| SV-26 | بوم pan/zoom مرکز اشاره‌گر، ruler mm، sync scale همهٔ پارامترها و reset/recipe dice | S03–04 | بخشی؛ range/offset/fillet/path نیز scale شوند، dice بازتولیدپذیر | 01 / FE |
| SV-27 | پنل dock/float و دو ستون، اندازهٔ ذخیره‌شده، مهار خارج صفحه، modal keyboard isolation | S04 | باز؛ resize کوچک و Esc و focus trap؛ undo پشت modal ممنوع | UI / FE |
| SV-28 | Performance Mode، worker همهٔ layoutها، handle زنده و محاسبه روی release، لغو/stale guard | S02,04 | بخشی؛ job قدیمی commit نشود، UI هنگام طرح متراکم پاسخگو و سقف روشن | 01,15 / FE |
| SV-29 | SVG قابل‌ویرایش دارای recipe و JSON با drag-drop restore و schema validation | S02 | بخشی؛ roundtrip همهٔ layout/controller/layer/image بدون اجرای script | 01,13 / FE |
| SV-30 | DXF بسته با mm و union و curve approximation error مشخص | S02,04 | بخشی؛ واردسازی مجدد و مقایسهٔ مرز در CAD مستقل | 15 / GE+QA |
| SV-31 | PNG شفاف 300DPI و حداقل 2048px ضلع بلند برای کار کوچک، سقف امن حافظه | S04 | باز؛ alpha/color/ratio درست و DPI metadata؛ raster خروجی CAD نامیده نشود | 15 / FE |
| SV-32 | STEP حقیقی B-rep، Surface/Solid Shapes Only با ضخامت و واحد و مختصات | S01–04 | باز؛ موتور CAD ارزیابی و مجوز، بازکردن در دو CAD، surface با solid اشتباه نشود | CAD spike,15 / GE |
| SV-33 | STEP draft با بررسی offset self-intersection/escape/collapse و highlight | S04 | باز؛ زاویه/ضخامت قبل خروجی اعتبارسنجی شود، نه STL با پسوند STEP | 32 / GE |
| SV-34 | STEP Split rows/cols، ZIP یک فایل در هر tile یا assembly با مختصات مطلق | S03 | باز؛ union مساحت/حجم با unsplit در tolerance و بارگذاری CAD سنجیده شود | 32 / GE+QA |
| SV-35 | Wrap import STEP و انتخاب وجه/چندوجه مماس، outline به ادیتور و برگشت pattern | S05,07 | باز؛ STEP اصلی محلی و transformها/واحد حفظ؛ الگو قابل‌تعویض بدون حذف تنظیمات | 13,32 / GE+FE |
| SV-36 | flatten دقیق صفحه/استوانه/مخروط؛ freeform/sphere کم‌اعوجاج با heatmap | S05 | بخشی مرتبط به UV، نه معادل؛ seam/pole و Jacobian، خطای طول/مساحت، منع ادعای صفر برای freeform | 35 / GE |
| SV-37 | Wrap raised/recessed/cut؛ Square/V/Peak/Rounded/Dome/Smooth، draft/fillet | S04–05 | باز؛ notch مرزی و جزیرهٔ donut و cross-face سالم، preview دقیقاً هندسهٔ export | 35–36 / GE |
| SV-38 | Depth Gradient point/line/curve، center/base height و range، Geometry Check | S04–05 | باز؛ ضخامت باقیمانده/برخورد/ناساختنی قبل export، invalid shape علامت‌دار | 19,37 / GE |
| SV-39 | Wrap project با STEP/recipe/settings/screenshot و export STEP solid/surface/split در مختصات قطعه | S05,11 | باز؛ roundtrip آفلاین، سقف حجم، repair غیرمخرب و مختصات مستقل آزموده | 34–38 / FE+GE |
| SV-40 | Repository thumbnail/rename/reorder/پوشه/multi-select/move/حذف برگشت‌پذیر، ZIP پوشه | S02,04 | بخشی؛ export/import پوشه با نام امن، عدم دستکاری فایل بی‌ربط، duplicate/permission tests | storage / FE |
| SV-41 | Browser/local folder/cloud با وضعیت اتصال، quota، conflict بین تب/دستگاه و recovery unsaved | S04,11 | بخشی؛ قطع permission و quota داده را از بین نبرد، cloud اختیاری و snapshot محلی | 40 / FE+BE |
| SV-42 | Marketplace رسمی/جامعه، جستجو/فیلتر/preview/likes/submit/status و original/fit size | S04,08 | باز؛ preset مستقل با مجوز، عدم حذف canvas در fit، moderation و takedown | 40,auth / BE+FE |
| SV-43 | حساب، پلن و entitlement: free/pro و pass/subscription، لغو/refund/webhook idempotent | S02,09,12 | بخشی؛ قیمت‌های مرجع تصمیم محصول ما نیست؛ محدودیت آنلاین نباید core آفلاین را قفل کند | auth / BE |
| SV-44 | MCP/REST: schema/list/preview/export/editable link، تصویر مرجع و mockup با اعلام AI | S10 | باز؛ همان engine، تایید عملیات خروجی/شبکه، scope محدود و تست قرارداد | 01,32,auth / BE |
| SV-45 | توکن یک‌بارنمایش و hash/revoke، OAuth consent، rate/size/quota و cleanup موقت | S10–11 | باز؛ tenant isolation، عدم log prompt/image/secret، TTL و revoke فوری | 44 / BE+QA |
| SV-46 | AI Custom: قاعدهٔ چیدمان با پارامتر قابل‌ویرایش، Save as my mode و restore | S04,10 | باز؛ DSL محدود بدون eval/شبکه/فایل، سقف زمان/نقطه و seed؛ بازبینی انسانی | 01,28,44 / GE+BE |
| SV-47 | Help/FAQ/tutorial/changelog/feedback/landing/gallery، زبان و touch/pen و میانبرهای جایگزین | S01–04 | بخشی؛ fa/RTL مقدم، آموزش تولیدشدهٔ خودمان، WCAG دستی و لمس واقعی | UI / FE+QA |
| SV-48 | Privacy/consent/حقوق طرح، گزارش هندسه اختیاری با رضایت اشتراک و حذف زمان‌دار | S11–12 | بخشی؛ هیچ STEP یا تصویر بی‌اجازه ارسال نشود؛ offline network audit و redaction | 35,41,45 / BE+QA |
| SV-49 | شمار عناصر، مساحت باز واقعی و درصد، حداقل ligament/لبه/اندازه و گزارش فرآیند | S02,06,12 | بخشی؛ محاسبهٔ union clipped نه مجموع area همپوشان، tolerance و هشدار آشکار | 10,15 / GE |
| SV-50 | پنل سوراخ‌دار مستقل، kerf/tool compensation و گزارش محدودیت حرارتی/صوتی/استحکام | نیاز تکمیلی / S12 | باز؛ تحلیل هندسی جای FEM/CFD نیست؛ fixture فیزیکی و CAD و خطای هندسی | 32,49 / GE+QA |

## ۴. قراردادهای اجرایی مشترک (انتخاب مستقل Patturn)

### هندسه و کنترلر

- Pipeline: validated recipe → deterministic layout → per-layer controller evaluation → shape/morph → transforms → boolean/clip → canonical geometry snapshot → preview/export. global rotation، unit spin و gradient angle سه تبدیل مجزا هستند.
- هر quantity واحد/دامنه دارد؛ ورودی NaN/Infinity/sparse array و buffer/index خراب رد شود؛ بودجهٔ نقاط/segments/Boolean قبل allocation اعمال شود. mm و rad/deg به‌صورت type/نام صریح.
- کنترلر دارای `geometryId` پایدار و channel state مستقل است؛ sync با ارجاع شناسه، نه اشتراک mutable object. حل تعارض: ترتیب ID پایدار؛ blend mode صریح با تست golden؛ فرمول نامستند مرجع تقلید نشود.
- فاصلهٔ point/segment/Bezier با tolerance ثبت‌شده؛ projection به curve و تکینگی endpoint تعریف شود. برای hard edge، حداکثر ناپیوستگی فقط در کانال مجاز؛ flow spacing/bend ناپیوسته ممنوع.
- canonical snapshot دارای `recipeHash`، `algorithmVersion`، tolerance، warning و geometry digest است؛ SVG/DXF/STL/PDF/STEP از همان snapshot. هر تغییر input خروجی درحال‌ساخت را باطل کند.
- مساحت باز = مساحت اجتماع ناحیه‌های خالی تقاطع مرز تقسیم بر مساحت قابل‌استفادهٔ مرز (با سوراخ‌ها). خط باز بدون stroke-width مساحت ندارد. دقت تخمینی/قطعی و حد خطا نمایش داده شود؛ kerf فقط پارامتر فرآیند است نه تغییر خاموش recipe.

### تصویر، فایل و امنیت

- SVG بدون script/event/external reference/foreignObject؛ DTD/entity و URL خارجی ممنوع، SVG metadata فقط JSON نسخه‌دار و bounded. DXF entityهای پشتیبانی‌نشده با شماره/نوع گزارش شوند؛ arc و units حفظ یا تبدیل با تأیید.
- decode تصویر با سقف bytes/pixels، alpha و رنگ تعریف‌شده، sample و خارج کادر صریح؛ هیچ network fetch از SVG/recipe. recipe از تصویر محلی با hash و asset reference استفاده کند؛ هنگام export حریم خصوصی/حجم قابل‌انتخاب.
- AI Custom با AST/DSL whitelist، نه JavaScript دلخواه؛ بودجهٔ instruction/time/output، no I/O؛ worker sandbox به‌تنهایی مجوز اجرای کد ناشناس نیست.
- cloud/MCP اختیاری؛ token در secure store دسکتاپ، نه فایل پروژه؛ telemetry خاموش پیش‌فرض، عدم fingerprint، ارسال گزارش فقط با انتخاب صریح محتوای قابل‌مشاهده و امکان حذف.

### CAD و Wrap

- پیش از انتخاب CAD kernel، spike مجوز، حجم WASM، memory، Worker، STEP healing/units و reproducibility لازم است. در صورت ناکامی، قابلیت با توضیح غیرفعال باشد؛ سرویس ابری اجباری جایگزین آفلاین نشود.
- صفحه/استوانه/مخروط آزمون طول‌قوس تحلیلی؛ سطح عمومی دارای distortion budget انتخابی و هشدار. seam، pole، trimmed face، topology naming و جهت normal پوشش داده شود.
- صرف دیدن mesh در مرورگر به معنی STEP valid نیست: B-rep check، CAD مستقل، volume، surface shell closure، export/import transform و جزایر آزموده شوند.

## ۵. فازبندی وابسته و واقع‌بینانه

برنامهٔ ۲۴هفته‌ای قبلی فقط خط پایهٔ محصول سفال است و برای این دامنه قابل اتکا نیست. زمان‌های زیر **برآورد نفر-هفتهٔ اولیه** هستند؛ جمع آن‌ها تعهد تقویمی نیست و پس از spikeها بازبرآورد لازم است. GE=مهندس هندسه، FE=رابط، BE=بک‌اند، QA=آزمون. هر فاز علاوه بر خروجی، تست و مستندات و دانلود وب/ویندوز دارد.

| فاز | هدف و IDs | پیش‌نیاز / برآورد | دروازهٔ خروج |
|---|---|---|---|
| S0 | baseline، registry، traceability و تصمیم CAD/مجوز (01,32,48) | شروع / GE2+FE1+QA1 | ماتریس منابع و fixture مستقل و ADR؛ موارد نامعلوم علامت‌دار |
| S1 | schema migration و canonical vector/clip/import (01,10,13,15) | S0 / GE6+FE3+QA2 | bounded parser، curve clipping و golden cross-format؛ undo roundtrip |
| S2 | ۹ layout پایه و primitive styles (02–08,11) | S1 / GE7+FE4+QA3 | switch بدون حذف recipe، seed ثابت، همهٔ حالت‌ها در UI و export |
| S3 | controllers و image و flow direction (09,19–23) | S2 / GE7+FE5+QA3 | fixture تحلیلی فاصله، حالت‌های نامعتبر غیرفعال، شبکهٔ خارجی صفر |
| S4 | custom editor، layers، fillet، mirror، snap و morph (12,14,16–18,24–25) | S1+S3 / GE8+FE8+QA4 | base/target/mirror/undo/180°/fixed regressions، keyboard+touch |
| S5 | UI performance و export 2D/PNG/restore (26–31,49) | S2–S4 / GE3+FE5+QA3 | measurement، open-area با bound، stale/cancel و performance profiling |
| S6 | STEP surface/solid/draft/split و CAD (32–34) | CAD spike+S4 / GE10+FE3+QA4 | دو CAD، topology معتبر، حجم/مساحت/split tolerance و گزارش منابع |
| S7 | Wrap developable surfaces و project format (35–36,39) | S6 / GE8+FE5+QA4 | seam/pole/units و مختصات و roundtrip، مدل اصلی دست‌نخورده |
| S8 | Wrap freeform، profile/depth و Geometry Check (36–38) | S7 / GE12+FE5+QA5 | heatmap و rejection budget، donut/cross-face/fillet/cut fixtures |
| S9 | Repository و cloud و marketplace (40–43) | S1، auth، S5 / BE7+FE7+QA4 | multi-tab conflict، disk permission، moderation، billing sandbox |
| S10 | MCP/REST و DSL AI Custom (44–46) | S6+S9 / BE6+GE4+FE3+QA4 | revoke/tenant/rate/TTL، no eval/no secret log و همان engine |
| S11 | محتوای مستقل، حریم خصوصی و انتشار/ساخت واقعی (47–50) | همه و گیت‌های قدیمی / GE3+BE2+FE4+QA6 | WCAG دستی، Windows install/offline/update، CAD/slicer/physical evidence |

**مسیر بحرانی:** S0→S1→S2→S3→S4→S6→S7→S8→S11. Repository و محتوای آموزشی می‌توانند پس از تثبیت schema موازی پیش بروند. انتشارهای میانی prerelease هستند. هدف 200k holes در S10 صرفاً حد ادعاشدهٔ مرجع است، نه عملکرد اثبات‌شدهٔ ما؛ پروفایل دستگاه مرجع و memory/latency budget پیش از تعهد لازم است.

### ترتیب کارهای قدیمی در کنار دامنهٔ جدید

1. 4.9/5.5/8.4 بردار دلخواه با S1 مشترک شود؛ 8.2 کاتر arbitrary پس از validation همان boundaries، نه parser موازی.
2. 8.5 دسته: API sweep موجود آزمایشی است؛ UI مسیر، اتصال واقعی/union و ناحیهٔ اتصال ۴mm، برخورد و fixture فیزیکی باقی است؛ S7 جای این کار را نمی‌گیرد.
3. 8.6 ریب، 8.10 extruder، 8.14 jigger، 7.5/8.15 slab و 6.6 مادرقالب باید طبق معیارهای قبلی کامل شوند؛ افزایش تعداد الگوها مجوز بستن آن‌ها نیست.
4. Windows 9.2/9.3/9.6/9.8/12.6–8، مجوز9.11، bilingual10.2، WCAG10.4، plans11.2، server11.7، slicer12.5، budget12.9، release evidence12.10، signing13.2، videos13.4، landing13.6 و support13.7 باز می‌مانند تا مدرک واقعی.
5. اولویت پس از این برنامه: S1 بردار امن و canonical snapshot؛ سپس layout/controller؛ ارزیابی CAD در مسیر موازی با سقف منابع و نتیجهٔ مکتوب. کارهایی که دستگاه/امضا/خرید/کاربر واقعی نیاز دارند به صف شواهد منتقل شوند، نه تیک تکمیل.

## ۶. سناریوهای پذیرش انتهابه‌انتها

- **SV-E01 پنل:** 120×80 با گوشهٔ R12، شبکهٔ hex، سوراخ 1.5–4mm، گرادیان شعاعی؛ درصد واقعی پس از clip با oracle مستقل مقایسه؛ عبور از 18% هدف باید tolerance عددی صریح داشته باشد، نه تصویر تزئینی.
- **SV-E02 تصویر:** PNG ramp سیاه→سفید و alpha، invert/contrast و همهٔ کانال‌ها؛ JSON/SVG reopen و بردار همسان بدون شبکه.
- **SV-E03 custom:** donut چندلایه، subtract+independent+fixed+mirror و target چرخیدهٔ 180°؛ هیچ collapse/جزیرهٔ حذف‌شده، Apply/Cancel/Undo و فایل reopened یکسان.
- **SV-E04 flow:** کنترلر منحنی با cap گرد کنار مرز چرخیده؛ خارج range خط مستقیم، invert gap و corner fillet؛ UI و SVG/DXF/STEP هندسهٔ واحد.
- **SV-E05 CAD:** surface و solid و draft و split 2×3؛ حجم/مساحت و مختصات در دو CAD، جزیره و curve retained؛ rollback در خطای offset.
- **SV-E06 Wrap:** plate/cylinder/cone/dome/double-curved، seam و cross-face donut؛ tolerance طول/مساحت و distortion heatmap، raised/recess/cut و هر profile/depth؛ export در مختصات اصلی.
- **SV-E07 storage:** crash و دو تب، حذف undo، پوشه ZIP، disk permission revoke، quota و cloud conflict؛ دادهٔ محلی حفظ و file traversal مسدود.
- **SV-E08 AI:** schema→preview→editable recipe→export؛ token revoked، scope نامعتبر، rate و timeout و DSL infinite loop؛ بدون eval و log تصویر/secret.
- **SV-E09 انتشار:** build از همان HEAD، QA و hashes، ZIP وب و EXE ویندوز قابل‌دانلود؛ نصب/حذف/ارتقای واقعی و آفلاین سیستم‌عامل شواهد جدا؛ تا آن زمان prerelease unsigned.

## ۷. معیار صداقت و نگهداری

تمام SVها در آغاز «بخشی/باز» هستند. افزودن سند یا API بدون UI/ذخیره/export/test به معنی برابری کامل نیست. برای بستن یک ID مسیر کد، tests، artifact hash، نسخه و محدودیت در چک‌لیست ثبت شود. موارد دسترسی‌نداشته، ویدئوهای پخش‌نشده، پرداخت و cloud و تمام رفتارهای خصوصی مرجع همچنان **تأییدنشده** هستند؛ عنوان «بررسی کامل نرم‌افزار عملی» نباید استفاده شود.
