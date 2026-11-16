import { prisma } from "@/lib/prisma";
import { customRange, isRangeKey, phDayKey, resolveRange, RANGE_LABEL, type Period, type RangeKey } from "@/lib/period";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export interface PageContext {
  brands: { id: string; name: string; slug: string }[];
  /** The selected brand; null = all brands. */
  brand: { id: string; name: string; slug: string } | null;
  period: Period;
  /** "Last 7 days", or "Nov 1 – Nov 7" for a custom range. */
  periodLabel: string;
  /** "Nov 9 – Nov 15", whatever the label says. */
  periodRange: string;
  /** The same range as two Manila days (inclusive), for the date picker. */
  periodDays: { from: string; to: string };
  ok: string | null;
  error: string | null;
  /** Build a link to `path` that keeps the current brand and dates. */
  href: (path: string, over?: { brand?: string | null }) => string;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
const DAY_MS = 24 * 60 * 60 * 1000;
const short = (day: string) =>
  new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

/**
 * The brand + date range a page is looking at, read from the URL:
 * `?brand=<code>`, then either `?from=YYYY-MM-DD&to=YYYY-MM-DD` (what the date
 * picker sets) or `?range=today|yesterday|7d|30d|mtd`.
 */
export async function pageContext(searchParams: SearchParams, defaultRange: RangeKey = "7d"): Promise<PageContext> {
  const sp = await searchParams;
  const brands = await prisma.brand.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } });
  const brand = brands.find((b) => b.slug === one(sp.brand)) ?? null;

  const from = one(sp.from);
  const to = one(sp.to);
  const custom = from ? customRange(from, to ?? from) : null;
  const rawRange = one(sp.range);
  const range: RangeKey = isRangeKey(rawRange) ? rawRange : defaultRange;
  const period = custom ?? resolveRange(range);
  const periodDays = { from: phDayKey(period.from), to: phDayKey(new Date(period.to.getTime() - DAY_MS)) };
  const periodRange = periodDays.from === periodDays.to ? short(periodDays.from) : `${short(periodDays.from)} – ${short(periodDays.to)}`;
  const periodLabel = custom
    ? periodRange
    : RANGE_LABEL[range];

  const href: PageContext["href"] = (path, over = {}) => {
    const q = new URLSearchParams();
    const slug = over.brand !== undefined ? over.brand : (brand?.slug ?? null);
    if (slug) q.set("brand", slug);
    if (custom) {
      q.set("from", periodDays.from);
      q.set("to", periodDays.to);
    } else if (range !== defaultRange) q.set("range", range);
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };

  return { brands, brand, period, periodLabel, periodRange, periodDays, ok: one(sp.ok), error: one(sp.error), href };
}
