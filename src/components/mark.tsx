/** The CEO Dashboard mark: three rising bars in a dark disc. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#1f1e1c" />
      <rect x="9" y="17" width="3.4" height="6" rx="1" fill="#fff" />
      <rect x="14.3" y="13" width="3.4" height="10" rx="1" fill="#fff" />
      <rect x="19.6" y="9" width="3.4" height="14" rx="1" fill="#e4a07f" />
    </svg>
  );
}
