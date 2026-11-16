/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function timeAgo(d: Date | null, now: Date = new Date()): string {
  if (!d) return "never";
  const s = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
