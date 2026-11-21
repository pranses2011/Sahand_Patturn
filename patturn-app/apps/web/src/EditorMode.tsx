import type { ReactNode } from 'react';

export type EditorMode = 'simple' | 'pro';

export function EditorModeSwitch({ mode, onChange }: { mode: EditorMode; onChange: (mode: EditorMode) => void }) {
  return <fieldset className="editor-mode">
    <legend>سطح کنترل‌ها</legend>
    <label><input type="radio" name="editor-mode" value="simple" checked={mode === 'simple'}
      onChange={() => onChange('simple')} /> ساده</label>
    <label><input type="radio" name="editor-mode" value="pro" checked={mode === 'pro'}
      onChange={() => onChange('pro')} /> حرفه‌ای</label>
    <p className="hint">تغییر حالت فقط نمایش کنترل‌ها را عوض می‌کند؛ تنظیمات و خروجی پروژه دست‌نخورده می‌مانند.</p>
  </fieldset>;
}

/** Keep advanced state in the parent; disclosure never resets project parameters. */
export function AdvancedControls({ mode, children }: { mode: EditorMode; children: ReactNode }) {
  if (mode === 'pro') return <section aria-label="کنترل‌های پیشرفته">{children}</section>;
  return <details className="advanced-controls"><summary>تنظیمات پیشرفته (مقادیر فعلی حفظ می‌شوند)</summary>
    {children}
  </details>;
}
