#!/usr/bin/env python3
"""Build a single self-contained RTL HTML handbook from the markdown files."""
import pathlib, re, html
import markdown

ROOT = pathlib.Path(__file__).parent
FILES = [
    ("README.md", "🗂️ جلد و فهرست"),
    ("00-ANALYSIS.md", "🔍 تحلیل"),
    ("01-ROADMAP.md", "🗺️ نقشه راه"),
    ("02-MASTER-PROMPT.md", "🧠 پرامپت اصلی"),
    ("03-ARCHITECTURE.md", "🏗️ معماری"),
    ("04-DATA-MODEL.md", "🗄️ مدل داده"),
    ("05-MODULE-FORMS.md", "🏺 فرم"),
    ("06-MODULE-PATTERNS.md", "🔷 الگو"),
    ("07-MODULE-MOLDS.md", "🧱 قالب"),
    ("08-MODULE-TOOLS.md", "🛠️ ابزارها"),
    ("09-UI-DESIGN-SYSTEM.md", "🎨 طراحی"),
    ("10-BACKEND-AUTH-BILLING.md", "🔐 بک‌اند"),
    ("11-QA-ACCEPTANCE.md", "✅ تست"),
    ("12-PHASE-PROMPTS.md", "🚀 پرامپت‌های فازی"),
    ("13-GAP-ANALYSIS.md", "➕ شکاف‌ها"),
    ("14-CHECKLIST.md", "✅ چک‌لیست"),
    ("15-RULES.md", "⚖️ قوانین"),
]

CSS = """
:root{
  --bg:#F7F3EC; --surface:#fff; --sunken:#EFE9DF; --line:#E3DBCC; --line2:#C9BEAB;
  --ink:#1C1917; --ink2:#57534E; --muted:#8A8178;
  --clay:#C4622D; --clay2:#A94F21; --plaster:#3F6C7A; --ok:#3F7D53; --warn:#C9902A; --danger:#B3382C;
  --r:14px; --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);
  font-family:"Vazirmatn",Inter,"Segoe UI",Tahoma,system-ui,sans-serif;
  font-size:16px;line-height:1.85;direction:rtl}
a{color:var(--clay2);text-decoration:none}
a:hover{text-decoration:underline}
.layout{display:grid;grid-template-columns:290px minmax(0,1fr);gap:0;max-width:1560px;margin:0 auto}
nav.toc{position:sticky;top:0;height:100vh;overflow-y:auto;padding:26px 20px 60px;
  border-inline-start:1px solid var(--line);background:linear-gradient(180deg,#fffdf8,#F7F3EC)}
nav.toc h2{font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 14px}
nav.toc a{display:flex;gap:10px;align-items:center;padding:9px 12px;border-radius:10px;
  color:var(--ink2);font-size:14.5px;font-weight:500;transition:.15s;margin-bottom:2px}
nav.toc a:hover{background:var(--sunken);color:var(--ink);text-decoration:none}
nav.toc a .em{font-size:17px;line-height:1}
main{padding:44px 54px 120px;min-width:0}
section.doc{padding-bottom:48px;margin-bottom:56px;border-bottom:2px dashed var(--line)}
section.doc:last-child{border:0}
h1,h2,h3,h4{line-height:1.3;font-weight:700}
h1{font-size:36px;margin:.4em 0 .5em;letter-spacing:-.01em}
h2{font-size:26px;margin:1.9em 0 .7em;padding-bottom:.35em;border-bottom:2px solid var(--line)}
h3{font-size:20px;margin:1.6em 0 .55em;color:var(--ink)}
h4{font-size:17px;margin:1.3em 0 .45em;color:var(--clay2)}
p,li{color:var(--ink2)}
strong{color:var(--ink)}
code{font-family:var(--mono);font-size:.86em;background:var(--sunken);border:1px solid var(--line);
  padding:.12em .42em;border-radius:6px;color:#8A3A16;direction:ltr;display:inline-block;unicode-bidi:embed}
pre{background:#1B1714;color:#EDE6DC;padding:18px 20px;border-radius:12px;overflow-x:auto;
  direction:ltr;text-align:left;font-size:13.2px;line-height:1.7;border:1px solid #2A2521}
pre code{background:none;border:0;color:inherit;padding:0;font-size:inherit;display:block}
table{border-collapse:separate;border-spacing:0;width:100%;margin:1.1em 0;font-size:14.5px;
  background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th{background:#F0E9DD;text-align:right;font-weight:700;color:var(--ink);padding:11px 14px;
  border-bottom:2px solid var(--line2);white-space:nowrap}
td{padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:top;color:var(--ink2)}
tr:last-child td{border-bottom:0}
tbody tr:hover td{background:#FBF7F0}
blockquote{margin:1.2em 0;padding:14px 20px;background:#FFF8EE;border-inline-start:4px solid var(--clay);
  border-radius:0 12px 12px 0;color:#5A4635}
blockquote p{margin:.3em 0}
ul,ol{padding-inline-start:1.5em}
li{margin:.28em 0}
hr{border:0;border-top:1px solid var(--line);margin:2em 0}
.mermaid-src{display:none}
pre.mermaid{background:#fff;border:1px solid var(--line);color:var(--ink2);font-size:12.5px}
input[type=checkbox]{accent-color:var(--clay);width:16px;height:16px;vertical-align:-3px;cursor:default}td.task{text-align:center}li.task{list-style:none}li.task input{margin-inline-end:8px}
.badge{display:inline-block;font-size:12px;font-weight:600;padding:2px 9px;border-radius:999px;
  background:#F6E7DC;color:var(--clay2);border:1px solid #EBD3C1}
.hero{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:36px;align-items:center;
  background:linear-gradient(135deg,#FFFDF8,#F3ECE0);border:1px solid var(--line);
  border-radius:24px;padding:38px 40px;margin-bottom:44px;box-shadow:0 18px 50px rgba(28,25,23,.07)}
.hero h1{margin:0 0 10px;font-size:44px;letter-spacing:-.02em}
.hero .kicker{font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:var(--clay2);font-weight:700}
.hero p{font-size:16.5px;color:var(--ink2);margin:.5em 0}
.hero .chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}
.hero .chips span{font-size:12.5px;font-weight:600;padding:6px 12px;border-radius:999px;
  background:#fff;border:1px solid var(--line2);color:var(--ink2)}
.hero img{width:100%;border-radius:16px;border:1px solid var(--line);box-shadow:0 10px 30px rgba(28,25,23,.10)}
@media (max-width:1100px){.hero{grid-template-columns:1fr;padding:26px}.hero img{order:-1}.hero h1{font-size:32px}}
.topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:14px;
  padding:12px 22px;background:rgba(247,243,236,.92);backdrop-filter:blur(8px);
  border-bottom:1px solid var(--line)}
.topbar .brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:16px}
.topbar .dot{width:26px;height:26px;border-radius:50%;background:var(--clay);display:grid;
  place-items:center;color:#fff;font-size:14px}
.topbar .grow{flex:1}
.topbar .tag{font-size:12px;color:var(--muted)}
@media (max-width:1100px){
  .layout{grid-template-columns:1fr}
  nav.toc{position:static;height:auto;border-inline-start:0;border-bottom:1px solid var(--line);
    display:flex;flex-wrap:wrap;gap:6px;padding:14px}
  nav.toc h2{display:none}
  nav.toc a{font-size:13px;padding:6px 10px;background:#fff;border:1px solid var(--line)}
  main{padding:26px 18px 90px}
  h1{font-size:27px} h2{font-size:22px}
  table{font-size:13px;display:block;overflow-x:auto;white-space:nowrap}
}
@media print{nav.toc,.topbar{display:none}.layout{grid-template-columns:1fr}main{padding:0}}
"""

JS = """
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>
try{
  mermaid.initialize({startOnLoad:false, theme:'base', securityLevel:'loose',
    themeVariables:{fontFamily:'Vazirmatn, sans-serif', primaryColor:'#F6E7DC',
      primaryTextColor:'#1C1917', primaryBorderColor:'#C4622D', lineColor:'#8A8178',
      secondaryColor:'#E4EEF1', tertiaryColor:'#EFE9DF', fontSize:'13px'}});
  document.addEventListener('DOMContentLoaded',()=>{
    mermaid.run({nodes:document.querySelectorAll('pre.mermaid')}).catch(()=>{});
  });
}catch(e){}
</script>
"""


def convert(path: pathlib.Path) -> str:
    text = path.read_text(encoding="utf-8")
    # pull out mermaid blocks before markdown conversion
    blocks = []

    def stash(m):
        blocks.append(m.group(1))
        return f"\n@@MERMAID{len(blocks)-1}@@\n"

    text = re.sub(r"```mermaid\n(.*?)```", stash, text, flags=re.S)
    md = markdown.Markdown(extensions=["tables", "fenced_code", "toc", "attr_list", "sane_lists"])
    body = md.convert(text)
    # render task list items as real checkboxes
    body = re.sub(r"<li>\[ \]\s*", '<li class="task"><input type="checkbox" disabled> ', body)
    body = re.sub(r"<li>\[x\]\s*", '<li class="task"><input type="checkbox" checked disabled> ', body)
    body = re.sub(r"<td([^>]*)>\[ \]</td>", r'<td\1 class="task"><input type="checkbox" disabled></td>', body)
    body = re.sub(r"<td([^>]*)>\[x\]</td>", r'<td\1 class="task"><input type="checkbox" checked disabled></td>', body)
    body = body.replace("[ ] ", "").replace("[x] ", "")
    for i, b in enumerate(blocks):
        body = body.replace(f"<p>@@MERMAID{i}@@</p>",
                            f'<pre class="mermaid">{html.escape(b)}</pre>')
        body = body.replace(f"@@MERMAID{i}@@", f'<pre class="mermaid">{html.escape(b)}</pre>')
    return body


def main():
    parts, nav = [], []
    for i, (fname, label) in enumerate(FILES):
        p = ROOT / fname
        if not p.exists():
            continue
        anchor = "doc-" + fname.replace(".md", "").replace("-", "")
        em, name = (label.split(" ", 1) + [""])[:2]
        nav.append(f'<a href="#{anchor}"><span class="em">{em}</span><span>{name}</span></a>')
        parts.append(f'<section class="doc" id="{anchor}">{convert(p)}</section>')

    out = f"""<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patturn Studio — بستهٔ تحلیل، نقشه راه و پرامپت پیاده‌سازی</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>{CSS}</style>
{JS}
</head>
<body>
<div class="topbar">
  <div class="brand"><span class="dot">🏺</span> Patturn Studio</div>
  <span class="badge">Handbook v1.0</span>
  <span class="grow"></span>
  <span class="tag">۱۷ سند · تحلیل + نقشه راه + پرامپت + قوانین + چک‌لیست</span>
</div>
<div class="layout">
<nav class="toc">
  <h2>فهرست اسناد</h2>
  {''.join(nav)}
</nav>
<main>
<div class="hero">
  <div>
    <div class="kicker">Product teardown · Roadmap · Build prompt</div>
    <h1>🏺 آرشیو کامل Patturn Studio</h1>
    <p><strong>تحلیل آینه‌ای سایت</strong> + <strong>نقشه راه ۸ فازی</strong> + <strong>پرامپت‌های آمادهٔ پیاده‌سازی</strong>
       برای ساخت یک پلتفرم طراحی پارامتریک سفال — از پروفیل نودی و revolve، تا الگوی بی‌درز، قالب چندتکه با کلید ثبت،
       مادرقالب سیلیکونی و خروجی STL/SVG/DXF/PDF.</p>
    <div class="chips">
      <span>🗂️ ۱۷ سند</span><span>🗺️ ۲۴ هفته نقشه راه</span><span>🧮 ۱۵ تست طلایی</span>
      <span>🧱 ۴ ماژول اصلی</span><span>🛠️ ۱۹ ابزار</span><span>➕ ۱۰ شکاف تکمیلی</span><span>⚖️ ۱۷ قانون AI</span><span>✅ ۱۲۲ کار چک‌لیست</span><span>🪟 نسخهٔ ویندوز آفلاین</span>
    </div>
  </div>
  <img src="assets/cover.jpg" alt="تصویر جلد: فرم سفالی پارامتریک و دو نیمهٔ قالب گچی">
</div>
{''.join(parts)}
</main>
</div>
</body>
</html>"""
    (ROOT / "index.html").write_text(out, encoding="utf-8")
    print("wrote index.html", len(out), "bytes")


if __name__ == "__main__":
    main()
