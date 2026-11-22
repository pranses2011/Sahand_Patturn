/** Decorative logical-forward arrow. Do not use for physical X/Y/Z directions. */
export function FlowArrow() {
  return (
    <span className="flow-arrow" aria-hidden="true">
      <svg viewBox="0 0 24 16" focusable="false" aria-hidden="true">
        <path
          d="M2 8H21M15 2L21 8L15 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
