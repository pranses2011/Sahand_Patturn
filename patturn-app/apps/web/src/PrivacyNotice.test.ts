import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import privacyText from '../../../docs/privacy.fa.txt?raw';
import { PrivacyNotice } from './PrivacyNotice';

describe('Packaged Persian privacy notice',()=>{
  it('renders the local document without remote content or active markup',()=>{
    const html=renderToStaticMarkup(createElement(PrivacyNotice));
    expect(html).toContain('<summary>حریم خصوصی و داده‌های محلی</summary>');
    expect(html).toContain('aria-label="اطلاعیهٔ حریم خصوصی"');
    expect(html).not.toMatch(/<script|<iframe|<img|https?:|<a\b/);
    expect(html).toContain(privacyText.trim());
  });
  it('covers storage, network, deletion and unverified desktop limitations',()=>{
    for(const text of ['localStorage','AppLocalData/backups','۱۰ نسخه','۳۰ تنظیم','WebView2','IP','رمزگذاری','دادهٔ سایت','uninstall','تأیید عملی نشده'])expect(privacyText).toContain(text);
  });
});
