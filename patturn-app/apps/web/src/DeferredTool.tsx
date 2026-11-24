import { useEffect, useState, type ComponentType } from 'react';

/** Fetch an optional tool only on first expansion. Collapse preserves its settings. */
export function DeferredTool<P extends object>({
  label,
  className,
  load,
  toolProps,
}: {
  label: string;
  className: string;
  load: () => Promise<{ default: ComponentType<P> }>;
  toolProps: P;
}) {
  const [requested, setRequested] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [Component, setComponent] = useState<ComponentType<P> | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    if (!requested || Component) return;
    let active = true;
    setError(false);
    void load()
      .then((module) => {
        if (active) setComponent(() => module.default);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [requested, attempt, load, Component]);
  return (
    <details
      className={className}
      onToggle={(event) => {
        if (event.currentTarget.open) setRequested(true);
      }}
    >
      <summary>{label}</summary>
      {requested && !Component && !error && <p role="status">در حال بارگذاری ابزار…</p>}
      {error && (
        <div role="alert">
          بارگذاری ابزار ناموفق بود؛ پروژه تغییر نکرد.
          <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>
            تلاش دوباره برای بارگذاری ابزار
          </button>
        </div>
      )}
      {Component && <Component {...toolProps} />}
    </details>
  );
}
