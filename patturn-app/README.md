# 🏺 Patturn — استودیوی طراحی پارامتریک سفال

نرم‌افزار طراحی برای سفالگران: **فرم سه‌بعدی ← الگوی بی‌درز ← قالب چندتکه ← خروجی STL/SVG/DXF**.
نسخهٔ اصلی: **اپ نصب‌شدنی ویندوز با اجرای کاملاً آفلاین** (قانون R-014) — نسخهٔ وب همان SPA است.

> 👤 نویسنده: **سعید نجفی** — شرکت **سهند سرویس** · پشتیبانی: Pranses2011@GMail.com · 09144220430 · حمایت: 6219 8619 1893 4679 · EA-Fixer.ir

## ⚡ شروع سریع (توسعه)

```bash
npm install          # نصب وابستگی‌ها
npm test             # ۳۶ تست (طلایی + ماژولی) — باید همه سبز شوند
npm run dev          # اجرای اپ وب روی http://localhost:5173
npm run build        # build تولیدی اپ وب
```

## 🪟 بسته‌بندی دسکتاپ ویندوز (روی ویندوز ۱۰/۱۱)

پیش‌نیاز: [Rust (stable)](https://rustup.rs) + Microsoft WebView2 (روی Win10/11 پیش‌فرض نصب است)

```bash
npm install
npm run desktop:build    # → تولید نصب‌کننده NSIS/MSI در apps/desktop/src-tauri/target/release/bundle/
npm run desktop:dev      # اجرای حین توسعه
```

خروجی: `Patturn_0.1.0_x64-setup.exe` (NSIS) و `*.msi` — نصب، ارتقا و حذف تمیز.

## 📦 ساختار مونوریپو

```
patturn-app/
├─ packages/
│  ├─ config/      # توکن‌ها، PLANS، اطلاعات نویسنده (R-013)
│  ├─ schema/      # Zod + SCHEMA_VERSION=3 + migration
│  ├─ kernel/      # ⭐ ParamGraph، پروفیل، revolve، حجم، شیرینک، mesh-validate
│  ├─ patterns/    # موتور الگو + کاشی بی‌درز + PRNG قطعی
│  ├─ molds/       # undercut، کلید ثبت، بلوک قالب، گچ/آب
│  ├─ exporters/   # STL باینری (با اعتبارسنجی)، SVG mm، DXF R12
│  └─ storage/     # قرارداد ذخیره: SQLite (دسکتاپ) / localStorage (وب)
├─ apps/
│  ├─ web/         # React + Vite + three.js — ادیتور سه‌ستونه
│  └─ desktop/     # Tauri 2 — پوستهٔ ویندوز (dialog/fs/sql/updater)
└─ vitest.config.ts
```

## ✅ تست‌های طلایی (قفل‌شده — با تغییر عدد، تست می‌شکند)

| تست | مقدار |
|-----|-------|
| ظرفیت فرم مرجع | **1131 ml ±1%** |
| پرشدگی ۸۰٪ | **958 ml ±1%** |
| شیرینک ۱۴۵mm @12% | **127.6 mm** |
| گچ/آب برای 1.84 L | **1.73 / 1.21 kg ±2%** |
| کلید ثبت (r=8,h=10,taper=4°) | **r_top = 8.6993 mm** |
| STL | watertight، نرمال بیرونی، Euler = 2 |
| SVG | خط ۱۰۰mm = ۱۰۰ واحد |

## ⚖️ قوانین

پایبند به [`../patturn-rebuild/15-RULES.md`](../patturn-rebuild/15-RULES.md) — مخصوصاً:
**R-001** (پول قبل از تغییر) · **R-002** (کامیت+پوش فارسی بعد از هر تغییر) · **R-014** (آفلاین مقدم بر ابری).
وضعیت وظایف: [`../patturn-rebuild/14-CHECKLIST.md`](../patturn-rebuild/14-CHECKLIST.md)
