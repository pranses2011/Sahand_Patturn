import { Component, type ReactNode } from 'react';

/** Only the disposable preview is reset; editor state and export controls remain mounted. */
export class ViewportBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; attempt: number }
> {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="viewport-failure" role="alert">
          <h3>نمایش سه‌بعدی در دسترس نیست</h3>
          <p>
            مرورگر یا درایور گرافیکی ممکن است WebGL را پشتیبانی نکند یا اتصال گرافیکی قطع شده باشد.
          </p>
          <p>
            تنظیمات پروژه حفظ شده‌اند؛ می‌توانید از کنترل‌ها، نمای تخت الگو و خروجی‌ها استفاده کنید.
            خطای نمایشگر به‌تنهایی به معنی نامعتبر بودن هندسه نیست.
          </p>
          <button
            className="btn"
            onClick={() =>
              this.setState(({ attempt }) => ({ failed: false, attempt: attempt + 1 }))
            }
          >
            تلاش دوباره برای نمایش سه‌بعدی
          </button>
        </div>
      );
    return (
      <div key={this.state.attempt} className="viewport-content">
        {this.props.children}
      </div>
    );
  }
}
