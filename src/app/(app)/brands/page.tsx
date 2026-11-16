import Link from "next/link";
import { createBrand } from "@/app/actions";
import { PageControls } from "@/components/page-controls";
import { Back, Banner, PageHeader, SectionHeader, cn } from "@/components/ui";
import { formatPeso } from "@/lib/money";
import { pageContext, type SearchParams } from "@/lib/page-context";
import { overview, type Overview } from "@/lib/reports";

const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const count = (n: number) => n.toLocaleString("en-PH");

/** Initials as a stand-in logo, the way the newer B.E.X marks brands. */
function BrandMark({ name, house = false }: { name: string; house?: boolean }) {
  const initials = name
    .replace(/[^A-Za-z0-9+ ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <div aria-hidden className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold", house ? "bg-ink text-on-ink" : "bg-accent-soft text-accent")}>
      {initials || "?"}
    </div>
  );
}

function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "healthy" | "critical" }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-text-faint">{label}</div>
      <div className={cn("mt-0.5 truncate text-[15px] font-semibold leading-none tnum", tone === "healthy" ? "text-healthy" : tone === "critical" ? "text-critical" : "text-text")}>{value}</div>
      {sub ? <div className="mt-1 truncate text-[10.5px] tnum text-text-faint">{sub}</div> : null}
    </div>
  );
}

function Figures({ o, wide = false }: { o: Overview; wide?: boolean }) {
  const adShare = o.pnl.sales > 0 && o.pnl.advertising > 0 ? o.pnl.advertising / o.pnl.sales : null;
  const net = o.pnl.netProfit;
  return (
    <div className={cn("mt-4 grid grid-cols-2 gap-x-3 gap-y-3", wide && "sm:grid-cols-4")}>
      <Figure label="Sales" value={formatPeso(o.pnl.sales)} sub={`${count(o.funnel.orders)} orders placed`} />
      <Figure label="Ad spend" value={formatPeso(o.pnl.advertising)} sub={adShare == null ? undefined : `${pct(adShare)} of sales`} />
      <Figure label="Delivery" value={pct(o.deliveredRate)} sub={`${count(o.funnel.delivered)} delivered`} />
      <Figure
        label="Net"
        value={formatPeso(net)}
        tone={net > 0 ? "healthy" : net < 0 ? "critical" : undefined}
        sub={o.costPerOrder == null ? undefined : `${formatPeso(o.costPerOrder)} ad cost / order`}
      />
    </div>
  );
}

export default async function BrandsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await pageContext(searchParams, "30d");
  const [all, perBrand] = await Promise.all([
    overview({ brandId: null }, ctx.period),
    Promise.all(ctx.brands.map(async (b) => ({ brand: b, o: await overview({ brandId: b.id }, ctx.period) }))),
  ]);
  // Date picks carry into the brand you enter.
  const keepDates = (path: string, slug: string | null) => ctx.href(path, { brand: slug });

  return (
    <div className="space-y-6">
      <PageHeader
        title="All brands"
        description="Every business you run, side by side. Enter one to work in it, or open the combined view to see them together."
        actions={<PageControls ctx={ctx} />}
        meta={<>{ctx.periodRange} · Manila time</>}
      />
      <Banner ok={ctx.ok} error={ctx.error} />

      <section className="space-y-5">
        <SectionHeader
          eyebrow="Where you work"
          title="Your brands"
          description="Each brand keeps its own orders, costs and stock — a figure on a card is the same figure on that brand's dashboard. The combined card adds them up; it never blends one product's costs into another's."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {perBrand.length > 1 ? (
            <div className="rounded-xl border border-ink/15 bg-surface-2/50 p-4 shadow-card sm:col-span-2 xl:col-span-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <BrandMark name="All brands" house />
                  <div>
                    <div className="text-[15px] font-semibold text-text">Everything together</div>
                    <div className="mt-0.5 text-[11.5px] text-text-muted">
                      {perBrand.length} brands · {perBrand.filter((b) => b.o.funnel.orders > 0).length} with orders this period
                    </div>
                  </div>
                </div>
                <Link href={keepDates("/", null)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-[12.5px] font-semibold text-on-ink hover:opacity-90">
                  Open combined view
                </Link>
              </div>
              <Figures o={all} wide />
            </div>
          ) : null}

          {perBrand.map(({ brand, o }) => (
            <div key={brand.id} className="flex min-w-0 flex-col rounded-xl border border-border bg-surface p-4 shadow-card">
              <div className="flex items-start gap-3">
                <BrandMark name={brand.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold text-text">{brand.name}</div>
                  <div className="mt-0.5 text-[11.5px] text-text-muted">
                    Brand code <span className="font-mono">{brand.slug}</span>
                  </div>
                </div>
              </div>
              {o.funnel.orders > 0 || o.pnl.sales > 0 ? (
                <Figures o={o} />
              ) : (
                <p className="mt-4 flex-1 rounded-lg border border-dashed border-border bg-surface-2/40 px-3 py-4 text-center text-[12px] text-text-muted">
                  No orders in this period — connect this brand&apos;s Pancake or Shopify store in{" "}
                  <Link href="/settings" className="underline">Settings</Link>.
                </p>
              )}
              <div className="mt-auto flex items-center gap-2 border-t border-border pt-3 [&:not(:first-child)]:mt-4">
                <Link
                  href={keepDates("/", brand.slug)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] font-semibold text-text hover:bg-surface-2"
                >
                  <span aria-hidden>→]</span> Enter
                </Link>
                <Link href={keepDates("/orders", brand.slug)} className="rounded-lg px-3 py-2 text-[12.5px] font-medium text-text-muted hover:bg-surface-2 hover:text-text">
                  Orders
                </Link>
              </div>
            </div>
          ))}

          <form
            id="add"
            action={createBrand}
            className="flex min-h-[13rem] scroll-mt-24 flex-col justify-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface-2/30 p-4 transition-colors focus-within:border-accent focus-within:bg-surface"
          >
            <Back to="/brands" />
            <div className="text-center">
              <span className="text-[22px] leading-none text-text-muted" aria-hidden>+</span>
              <div className="text-[13px] font-semibold text-text-muted">Add a brand</div>
              <div className="mx-auto max-w-[15rem] text-[11.5px] text-text-faint">Its own orders, costs and stock — connect its store in Settings after.</div>
            </div>
            <label className="sr-only" htmlFor="new-brand-name">New brand name</label>
            <input
              id="new-brand-name"
              name="name"
              required
              placeholder="e.g. Nourio"
              className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-text-faint focus:border-accent"
            />
            <button type="submit" className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-semibold text-on-ink hover:opacity-90">
              Add brand
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
