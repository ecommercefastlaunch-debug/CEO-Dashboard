// The business runs on Philippine time (UTC+8, no daylight saving), wherever
// the server happens to be. A "day" always means a Manila day.

const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Manila calendar date of an instant, as YYYY-MM-DD. */
export function phDayKey(d: Date): string {
  return new Date(d.getTime() + PH_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant a Manila calendar day begins. */
export function phStartOfDay(dayKey: string): Date {
  return new Date(new Date(`${dayKey}T00:00:00.000Z`).getTime() - PH_OFFSET_MS);
}

export const RANGES = ["today", "yesterday", "7d", "30d", "mtd"] as const;
export type RangeKey = (typeof RANGES)[number];
export const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  mtd: "This month",
};

export interface Period {
  /** Inclusive. */
  from: Date;
  /** Exclusive. */
  to: Date;
}

export function isRangeKey(v: unknown): v is RangeKey {
  return typeof v === "string" && (RANGES as readonly string[]).includes(v);
}

/** Resolve a named range to instants. Ranges end at the end of today (Manila). */
export function resolveRange(key: RangeKey, now: Date = new Date()): Period {
  const todayStart = phStartOfDay(phDayKey(now));
  const tomorrow = new Date(todayStart.getTime() + DAY_MS);
  switch (key) {
    case "today":
      return { from: todayStart, to: tomorrow };
    case "yesterday":
      return { from: new Date(todayStart.getTime() - DAY_MS), to: todayStart };
    case "7d":
      return { from: new Date(todayStart.getTime() - 6 * DAY_MS), to: tomorrow };
    case "30d":
      return { from: new Date(todayStart.getTime() - 29 * DAY_MS), to: tomorrow };
    case "mtd":
      return { from: phStartOfDay(`${phDayKey(now).slice(0, 7)}-01`), to: tomorrow };
  }
}

/** A custom range from two YYYY-MM-DD strings (both inclusive Manila days). */
export function customRange(fromKey: string, toKey: string): Period | null {
  const ok = /^\d{4}-\d{2}-\d{2}$/;
  if (!ok.test(fromKey) || !ok.test(toKey)) return null;
  const from = phStartOfDay(fromKey);
  const to = new Date(phStartOfDay(toKey).getTime() + DAY_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return null;
  return { from, to };
}
