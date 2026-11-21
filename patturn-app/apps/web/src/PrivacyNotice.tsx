import privacyText from '../../../docs/privacy.fa.txt?raw';

/** One local source for the packaged notice and the repository document. */
export function PrivacyNotice() {
  return (
    <details className="privacy-notice">
      <summary>حریم خصوصی و داده‌های محلی</summary>
      <section aria-label="اطلاعیهٔ حریم خصوصی" className="hint" style={{ whiteSpace: 'pre-line' }}>
        {privacyText}
      </section>
    </details>
  );
}
