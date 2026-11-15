import { prisma } from "@/lib/prisma";
import { isRangeKey, resolveRange, type Period, type RangeKey } from "@/lib/period";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export interface PageContext {
  brands: { id: string; name: string; slug: string }[];
  /** The selected brand; null = all brands. */
  brand: { id: string; name: string; slug: string } | null;
  range: RangeKey;
  period: Period;
  ok: string | null;
  error: string | null;
  /** Build a link to `path` that keeps the current brand and range. */
  href: (path: string, over?: { brand?: string | null; range?: RangeKey }) => string;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/** The brand + date range a page is looking at, read from the URL. */
export async function pageContext(searchParams: SearchParams, defaultRange: RangeKey = "7d"): Promise<PageContext> {
  const sp = await searchParams;
  const brands = await prisma.brand.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } });
  const brand = brands.find((b) => b.slug === one(sp.brand)) ?? null;
  const rawRange = one(sp.range);
  const range = isRangeKey(rawRange) ? rawRange : defaultRange;

  const href: PageContext["href"] = (path, over = {}) => {
    const q = new URLSearchParams();
    const slug = over.brand !== undefined ? over.brand : (brand?.slug ?? null);
    if (slug) q.set("brand", slug);
    const r = over.range ?? range;
    if (r !== defaultRange) q.set("range", r);
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };

  return { brands, brand, range, period: resolveRange(range), ok: one(sp.ok), error: one(sp.error), href };
}
