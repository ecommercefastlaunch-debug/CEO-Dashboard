import Link from "next/link";
import { syncAll } from "@/app/actions";
import { PageControls } from "@/components/page-controls";
import { SalesChart } from "@/components/sales-chart";
import { Back, Banner, Button, Card, Empty, InfoTip, PageHeader, Section, buttonClass, cn, tableBody, tableHead, td, th, toneText, type Tone } from "@/components/ui";
import { formatPeso } from "@/lib/money";
import { pageContext, type SearchParams } from "@/lib/page-context";
import { attention, dailySeries, lastActivity, overview, type Overview } from "@/lib/reports";
import { timeAgo } from "@/lib/time-ago";

const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const count = (n: number) => n.toLocaleString("en-PH");
const times = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}×`);

// ── Health banner ──────────────────────────────────────────────────────────

function HealthBanner({ o }: { o: Overview }) {
  const { pnl } = o;
  let tone: Tone;
  let title: string;
  let body: string;
  if (pnl.sales === 0) {
    tone = "neutral";
    title = "No delivered sales in this period yet";
    body = "Sales are counted when an order is delivered. Orders still on their way show up below.";
  } else if (pnl.netProfit < 0) {
    tone = "critical";
    title = `Losing money — ${formatPeso(-pnl.netProfit)} net loss this period`;
    body =
      o.headroom != null && o.headroom < 1
        ? `Ads cost ${formatPeso(pnl.advertising)} but the sales could only carry ${formatPeso(Math.max(0, o.affordableAds ?? 0))}. Fix the cost per order before scaling.`
        : "Costs are higher than what the delivered orders brought in. Check returns and expenses below.";
  } else if (o.headroom != null && o.headroom < 1.5) {
    tone = "warning";
    title = `Profitable, but thin — keeping ${pct(pnl.netProfit / pnl.sales)} of sales`;
    body = "A small rise in ad cost or returns would tip this into a loss.";
  } else {
    tone = "healthy";
    title = `Making money — ${formatPeso(pnl.netProfit)} net profit this period`;
    body = `${pct(pnl.netProfit / pnl.sales)} of every peso of sales is kept after goods, ads and expenses.`;
  }
  const box: Record<Tone, string> = {
    critical: "border-critical/40 bg-critical-soft",
    warning: "border-warning/40 bg-warning-soft",
    healthy: "border-healthy/40 bg-healthy-soft",
    neutral: "border-border bg-surface-2",
    accent: "border-accent/30 bg-accent-soft",
    info: "border-info/30 bg-info-soft",
  };
  const dot: Record<Tone, string> = { critical: "bg-critical", warning: "bg-warning", healthy: "bg-healthy", neutral: "bg-text-faint", accent: "bg-accent", info: "bg-info" };
  return (
    <div role="status" className={cn("rounded-xl border px-5 py-4", box[tone])}>
      <div className={cn("flex items-start gap-2.5 text-[15px] font-semibold", toneText[tone])}>
        <span className={cn("mt-[7px] h-2 w-2 shrink-0 rounded-full", dot[tone])} />
        {title}
      </div>
      <p className="mt-1 pl-[18px] text-[13px] text-text-muted">{body}</p>
    </div>
  );
}

// ── Hero pair: ad headroom gauge + cost per order vs affordable ─────────────

function HeadroomHero({ o }: { o: Overview }) {
  const h = o.headroom;
  const marker = h == null ? null : Math.min(Math.max(h / 4, 0), 1) * 100;
  const losing = h != null && h < 1;
  const affordablePerOrder = o.affordableAds != null && o.funnel.orders > 0 ? Math.round(o.affordableAds / o.funnel.orders) : null;
  const cpp = o.costPerOrder;
  const fill = cpp != null && affordablePerOrder != null && affordablePerOrder > 0 ? Math.min((cpp / affordablePerOrder) * 100, 100) : 0;
  const room = cpp != null && affordablePerOrder != null ? affordablePerOrder - cpp : null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rise-in rounded-xl border border-border bg-surface p-5 shadow-card">
        <div className="flex items-center text-[13px] font-medium text-text-muted">
          Ad headroom
          <InfoTip text="What the ads could cost before you stop making money (sales minus goods and every other expense), divided by what they actually cost. Below 1× the ads are eating the profit." />
          <span className="ml-1 font-normal text-text-faint">— can you scale?</span>
        </div>
        <div className={cn("mt-1 text-[52px] font-semibold leading-none tracking-tight tnum", h == null ? "text-text-faint" : losing ? "text-critical" : h < 2 ? "text-warning" : "text-healthy")}>
          {times(h)}
        </div>
        <div className="relative mt-4 flex h-2.5 overflow-hidden rounded-full">
          <div className="h-full bg-critical" style={{ width: "25%" }} />
          <div className="h-full bg-warning" style={{ width: "37.5%" }} />
          <div className="h-full bg-healthy" style={{ width: "37.5%" }} />
          {marker != null ? <div className="absolute top-[-3px] h-[16px] w-[3px] -translate-x-1/2 rounded bg-ink shadow-[0_0_0_2px_var(--surface)]" style={{ left: `${marker}%` }} /> : null}
        </div>
        <div className="mt-1.5 flex justify-between text-[10.5px] text-text-faint">
          <span>Losing &lt;1×</span>
          <span>Thin</span>
          <span>Scale &gt;2.5×</span>
        </div>
        {h == null ? <p className="mt-2 text-[12px] text-text-faint">Needs delivered sales and recorded ad spend for this period.</p> : null}
      </div>

      <div className="rise-in rounded-xl border border-border bg-surface p-5 shadow-card">
        <div className="flex items-center text-[13px] font-medium text-text-muted">
          What you pay vs what you can afford
          <span className="ml-1 font-normal text-text-faint">— ad spend per order</span>
        </div>
        <div className="mt-6 h-7 w-full rounded-md" style={{ background: "color-mix(in srgb, var(--healthy) 12%, transparent)" }}>
          <div className="relative h-full">
            <div className={cn("bar-grow h-full rounded-l-md", room != null && room < 0 ? "bg-critical/85" : "bg-healthy/85")} style={{ width: `${fill}%` }} />
            <div className="absolute top-[-6px] h-[40px] w-0.5 rounded bg-critical" style={{ left: "100%" }} />
          </div>
        </div>
        <div className="mt-2.5 flex justify-between text-xs text-text-muted">
          <span className="inline-flex items-center">
            Ad cost / order <b className="ml-1 text-text">{cpp == null ? "—" : formatPeso(cpp)}</b>
          </span>
          <span className="inline-flex items-center text-critical">
            Break-even <b className="ml-1">{affordablePerOrder == null ? "—" : formatPeso(affordablePerOrder)}</b>
            <InfoTip text="The most an order can cost in ads before the period stops making money, spread over orders placed." align="right" />
          </span>
        </div>
        <div className={cn("mt-3 text-[13px] font-semibold", room == null ? "text-text-faint" : room > 0 ? "text-healthy" : "text-critical")}>
          {room == null ? "Record ad spend in Accounting to compare." : room > 0 ? `${formatPeso(room)} of room per order` : `${formatPeso(-room)} over the line per order`}
        </div>
      </div>
    </div>
  );
}

// ── Story cards ────────────────────────────────────────────────────────────

function StoryCard({
  eyebrow,
  title,
  question,
  accent,
  hero,
  stats,
  takeaway,
}: {
  eyebrow: string;
  title: string;
  question: string;
  accent: string;
  hero: { label: string; value: string; tone: Tone; info?: string };
  stats: { label: string; value: string; tone?: Tone; info?: string }[];
  takeaway: { text: React.ReactNode; tone: Tone };
}) {
  return (
    <div className="rise-in relative flex min-w-0 flex-col rounded-2xl border border-border bg-surface shadow-card">
      <div className="h-1 w-full rounded-t-2xl" style={{ background: accent }} />
      <div className="flex flex-1 flex-col p-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>{eyebrow}</div>
        <h3 className="mt-0.5 font-serif text-lg font-medium text-text">{title}</h3>
        <p className="text-[12px] text-text-faint">{question}</p>
        <div className="mt-4">
          <div className="flex items-center text-[11px] font-medium text-text-muted">
            {hero.label}
            {hero.info ? <InfoTip text={hero.info} align="left" /> : null}
          </div>
          <div className={cn("mt-0.5 text-[34px] font-semibold leading-none tracking-tight tnum", toneText[hero.tone])}>{hero.value}</div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0">
              <div className="flex items-center text-[10.5px] font-medium text-text-faint">
                <span className="truncate">{s.label}</span>
                {s.info ? <InfoTip text={s.info} align="left" /> : null}
              </div>
              <div className={cn("mt-0.5 truncate text-[15px] font-semibold leading-none tnum", toneText[s.tone ?? "neutral"])}>{s.value}</div>
            </div>
          ))}
        </div>
        <p className={cn("mt-4 text-[12.5px] leading-relaxed", takeaway.tone === "neutral" ? "text-text-muted" : toneText[takeaway.tone])}>{takeaway.text}</p>
      </div>
    </div>
  );
}

// ── Where every order ended up ────────────────────────────────────────────

const OUTCOMES = [
  { keys: ["DELIVERED"], label: "Delivered", color: "var(--healthy)", sub: "cash collected", money: "healthy" as Tone },
  { keys: ["CANCELLED"], label: "Cancelled", color: "var(--critical)", sub: "lost before shipping", money: "critical" as Tone },
  { keys: ["RETURNED", "RETURNING"], label: "RTS / Returned", color: "var(--rts)", sub: "shipped then bounced", money: "warning" as Tone },
  { keys: ["SHIPPED"], label: "Shipped", color: "color-mix(in srgb, var(--accent) 55%, var(--surface))", sub: "out for delivery", money: "neutral" as Tone },
  { keys: ["NEW", "CONFIRMED"], label: "On process", color: "var(--border-strong)", sub: "not yet dispatched", money: "neutral" as Tone },
];

function OrderOutcomes({ o }: { o: Overview }) {
  const f = o.funnel;
  const rows = OUTCOMES.map((x) => ({
    ...x,
    n: x.keys.reduce((s, k) => s + (f.byStatus[k] ?? 0), 0),
    value: x.keys.reduce((s, k) => s + (f.valueByStatus[k] ?? 0), 0),
  }));
  const share = (n: number) => (f.orders ? n / f.orders : 0);
  return (
    <Card title="Where every order ended up" subtitle="Count, share, and pesos on the line for every order placed in the period.">
      {f.orders === 0 ? (
        <p className="py-6 text-center text-[13px] text-text-faint">No orders in this period yet.</p>
      ) : (
        <>
          <div className="flex h-9 overflow-hidden rounded-lg" role="img" aria-label="Share of orders by outcome">
            {rows.map((r) =>
              r.n ? (
                <div
                  key={r.label}
                  className="bar-grow flex items-center justify-center text-[11px] font-semibold text-white"
                  style={{ width: `${share(r.n) * 100}%`, background: r.color }}
                  title={`${r.label}: ${pct(share(r.n))}`}
                >
                  {share(r.n) >= 0.07 ? `${Math.round(share(r.n) * 100)}%` : ""}
                </div>
              ) : null,
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {rows.map((r) => (
              <div key={r.label} className="min-w-0 rounded-lg border border-border bg-surface px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-text">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                  {r.label}
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-[20px] font-semibold leading-none tnum text-text">{count(r.n)}</span>
                  <span className="text-[11px] tnum text-text-faint">· {pct(share(r.n))}</span>
                </div>
                <div className={cn("mt-1 text-[12px] font-semibold tnum", toneText[r.money])}>{formatPeso(r.value)}</div>
                <div className="text-[11px] text-text-faint">{r.sub}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-text-faint">
            {count(f.inFlight)} orders still in flight — the delivered rate elsewhere is calculated on the {count(f.delivered + f.returned)} that have finished their trip.
          </p>
        </>
      )}
    </Card>
  );
}

// ── Money position (the "Shipped volume" card's shape) ────────────────────

function MoneyPosition({ o }: { o: Overview }) {
  const p = o.position;
  const cell = (label: string, value: number, sub: string, tone: Tone = "neutral") => (
    <div className="min-w-0 rounded-xl border border-border bg-surface px-4 py-3 shadow-card">
      <div className="text-[11px] font-medium text-text-muted">{label}</div>
      <div className={cn("mt-1 text-[22px] font-semibold leading-none tracking-tight tnum", toneText[tone])}>{formatPeso(value)}</div>
      <div className="mt-1 text-[11px] text-text-faint">{sub}</div>
    </div>
  );
  return (
    <Card flush>
      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {cell("Cash", p.cash, "in the bank, as recorded", p.cash < 0 ? "critical" : "neutral")}
        {cell("Owed to us", p.receivable, "couriers & gateways still to remit", "healthy")}
        {cell("Stock on hand", o.stockValue, "at cost, in the warehouse")}
        {cell("Owed to suppliers", p.payable, "stock received, not yet paid", p.payable ? "warning" : "neutral")}
      </div>
      <div className="border-t border-border px-5 py-2.5 text-[12px] text-text-muted">
        Cash plus what couriers owe you: <b className="tnum text-text">{formatPeso(p.cash + p.receivable)}</b>. Cash only moves when you record it in{" "}
        <Link href="/accounting" className="underline">Accounting</Link>.
      </div>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await pageContext(searchParams);

  if (!ctx.brands.length) {
    return (
      <>
        <PageHeader title="Overview" description="Where you are, what's leaking, and where the money is — for every brand." />
        <Empty title="No brands yet" action={<Link href="/settings" className={buttonClass("primary")}>Add your first brand</Link>}>
          Add your brands in Settings, connect their Pancake or Shopify stores, then add your products in Warehouse. The numbers fill in from there.
        </Empty>
      </>
    );
  }

  const scope = { brandId: ctx.brand?.id ?? null };
  const [o, a, series, activity, perBrand] = await Promise.all([
    overview(scope, ctx.period),
    attention(scope),
    dailySeries(scope, ctx.period),
    lastActivity(scope),
    ctx.brand ? Promise.resolve([]) : Promise.all(ctx.brands.map(async (b) => ({ brand: b, o: await overview({ brandId: b.id }, ctx.period) }))),
  ]);
  const { pnl, funnel } = o;
  const attentionCount = a.unmatchedSkus.length + a.lowStock.length + a.connectionErrors.length + (a.failedEvents ? 1 : 0);

  const roasTone: Tone = o.roas == null ? "neutral" : o.roas >= 3 ? "healthy" : o.roas < 2 ? "critical" : "warning";
  const drTone: Tone = o.deliveredRate == null ? "neutral" : o.deliveredRate >= 0.8 ? "healthy" : o.deliveredRate < 0.6 ? "critical" : "warning";
  const profitTone: Tone = pnl.netProfit > 0 ? "healthy" : pnl.netProfit < 0 ? "critical" : "neutral";
  const cancelRate = funnel.orders ? (funnel.byStatus.CANCELLED ?? 0) / funnel.orders : null;

  return (
    <>
      <PageHeader
        title={ctx.brand ? ctx.brand.name : "Overview"}
        description="Where you are, what's leaking, and where the money is."
        actions={
          <>
            <form action={syncAll}>
              <Back to={ctx.href("/")} />
              <Button variant="secondary" size="sm" className="h-[30px]">Refresh all data</Button>
            </form>
            <PageControls ctx={ctx} />
          </>
        }
        meta={
          <>
            Last order update {timeAgo(activity.lastEventAt)} · last pull {timeAgo(activity.lastSyncAt)}
            <br />
            {ctx.periodRange} · Manila time
          </>
        }
      />
      <Banner ok={ctx.ok} error={ctx.error} />

      <Card
        title="Sales over time"
        subtitle="Delivered cash vs orders placed, ad spend, and money lost to cancels/RTS — day by day"
        action={
          <div className="hidden gap-4 text-right sm:flex">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-text-faint">Order amount</div>
              <div className="text-sm font-semibold tnum text-text">{formatPeso(funnel.orderedValue)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-text-faint">Delivered amount</div>
              <div className="text-sm font-semibold tnum text-healthy">{formatPeso(pnl.sales)}</div>
              <div className="text-[10px] tnum text-text-faint">{count(funnel.delivered)} delivered</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-text-faint">Orders</div>
              <div className="text-sm font-semibold tnum text-text">{count(funnel.orders)}</div>
              <div className="text-[10px] text-text-faint">placed</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-text-faint">Ad spent</div>
              <div className="text-sm font-semibold tnum text-text">{formatPeso(pnl.advertising)}</div>
            </div>
          </div>
        }
      >
        <SalesChart points={series} />
      </Card>

      <Section
        eyebrow="Where you stand"
        title="Position & ad headroom"
        description="Sales and profit count an order on the day it is DELIVERED; orders placed count on the day the customer ordered. Ad headroom is what the ads could cost before the period stops making money, divided by what they did cost."
      >
        <HealthBanner o={o} />
        <HeadroomHero o={o} />
      </Section>

      <Section
        eyebrow="The three questions"
        title="Acquisition, fulfilment, profit"
        description="A COD business fails three ways: the ads cost too much, the parcels come back, or the maths never worked. One card each, with the single number that answers it."
      >
      <div className="grid gap-4 lg:grid-cols-3">
        <StoryCard
          eyebrow="Acquisition"
          title="Buying customers"
          question="Are the ads paying for themselves?"
          accent="var(--accent)"
          hero={{ label: "Ad cost per order", value: o.costPerOrder == null ? "—" : formatPeso(o.costPerOrder), tone: "neutral", info: "Ad spend ÷ orders placed in the period." }}
          stats={[
            { label: "Ad spend", value: formatPeso(pnl.advertising) },
            { label: "Orders placed", value: count(funnel.orders) },
            { label: "ROAS", value: times(o.roas), tone: roasTone, info: "Delivered sales ÷ ad spend." },
          ]}
          takeaway={
            o.roas == null
              ? { text: "No ad spend recorded for this period. Record it in Accounting to see what each order costs to win.", tone: "neutral" }
              : { text: o.roas >= 3 ? `Every ₱1 in ads brings back ${formatPeso(Math.round(o.roas * 100))} in delivered sales.` : o.roas < 2 ? `Ads bring back only ${formatPeso(Math.round(o.roas * 100))} per ₱1 spent — check the creatives and the cost per order.` : "Ads pay back, but thinly.", tone: roasTone }
          }
        />
        <StoryCard
          eyebrow="Fulfilment"
          title="Getting paid"
          question="Do the parcels actually get delivered?"
          accent="var(--healthy)"
          hero={{ label: "Delivered rate", value: pct(o.deliveredRate), tone: drTone, info: "Of orders placed in the period that finished their trip: delivered ÷ (delivered + returned)." }}
          stats={[
            { label: "Delivered", value: count(funnel.delivered), tone: "healthy" },
            { label: "Returned", value: count(funnel.returned), tone: funnel.returned ? "critical" : "neutral" },
            { label: "Cancel rate", value: pct(cancelRate), tone: cancelRate != null && cancelRate > 0.15 ? "critical" : "neutral" },
          ]}
          takeaway={
            o.deliveredRate == null
              ? { text: "No orders from this period have finished delivery yet.", tone: "neutral" }
              : { text: `${count(funnel.returned)} of ${count(funnel.delivered + funnel.returned)} finished parcels came back unpaid. Every return still costs the courier fee.`, tone: drTone }
          }
        />
        <StoryCard
          eyebrow="Finance"
          title="The bottom line"
          question="After everything, are you making money?"
          accent="var(--ink)"
          hero={{ label: "Net profit", value: formatPeso(pnl.netProfit), tone: profitTone, info: "Delivered sales minus the cost of goods, ads, courier fees and every recorded expense." }}
          stats={[
            { label: "Sales", value: formatPeso(pnl.sales) },
            { label: "Gross profit", value: formatPeso(pnl.grossProfit), info: "Sales minus the frozen cost of the goods." },
            { label: "Margin", value: pnl.sales ? pct(pnl.netProfit / pnl.sales) : "—", tone: profitTone },
          ]}
          takeaway={
            pnl.sales === 0
              ? { text: "Profit appears once orders in this period are delivered.", tone: "neutral" }
              : { text: pnl.netProfit >= 0 ? `You keep ${formatPeso(pnl.netProfit)} after goods (${formatPeso(pnl.cogs)}), ads (${formatPeso(pnl.advertising)}) and other costs (${formatPeso(pnl.totalExpenses - pnl.advertising)}).` : `You lose ${formatPeso(-pnl.netProfit)} after goods, ads and other costs. Start with the biggest of the three.`, tone: profitTone }
          }
        />
      </div>

      </Section>

      <Section
        eyebrow="Where the money is"
        title="Cash, receivables & stock"
        description="A position, not a period: every peso recorded so far, whatever dates are picked above. Cash only moves when you record it in Accounting."
        tone="structural"
      >
        <MoneyPosition o={o} />
      </Section>

      <Section
        eyebrow="What moved"
        title="Where orders end up"
        description="Every order placed in the period, by what has become of it since. Orders still in flight haven't landed either way yet, so the delivered rate is worked out only on those that have."
      >
        <OrderOutcomes o={o} />
      </Section>

      {!ctx.brand && perBrand.length > 1 ? (
        <Section
          eyebrow="Compare"
          title="Brand by brand"
          description="The same period for each brand on its own — no brand's costs are blended into another's. Click a brand to open its dashboard."
          right={<Link href="/brands" className={buttonClass("secondary", "sm")}>See all brands</Link>}
        >
          <Card flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className={tableHead}>
                  <tr>
                    <th className={th}>Brand</th>
                    <th className={`${th} text-right`}>Sales</th>
                    <th className={`${th} text-right`}>Ad spend</th>
                    <th className={`${th} text-right`}>ROAS</th>
                    <th className={`${th} text-right`}>Net profit</th>
                    <th className={`${th} text-right`}>Orders</th>
                    <th className={`${th} text-right`}>Delivered</th>
                  </tr>
                </thead>
                <tbody className={tableBody}>
                  {perBrand.map(({ brand, o: b }) => (
                    <tr key={brand.id} className="hover:bg-surface-2/50">
                      <td className={td}>
                        <Link href={ctx.href("/", { brand: brand.slug })} className="font-medium hover:text-accent">{brand.name}</Link>
                      </td>
                      <td className={`${td} text-right tnum`}>{formatPeso(b.pnl.sales)}</td>
                      <td className={`${td} text-right tnum`}>{formatPeso(b.pnl.advertising)}</td>
                      <td className={`${td} text-right tnum`}>{times(b.roas)}</td>
                      <td className={cn(td, "text-right font-semibold tnum", b.pnl.netProfit < 0 ? "text-critical" : b.pnl.netProfit > 0 ? "text-healthy" : "")}>{formatPeso(b.pnl.netProfit)}</td>
                      <td className={`${td} text-right tnum`}>{count(b.funnel.orders)}</td>
                      <td className={`${td} text-right tnum`}>{pct(b.deliveredRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Section>
      ) : null}

      <Section
        eyebrow="What to fix"
        title="Needs attention & first move"
        description="The things that make the numbers wrong until someone acts, and the one move worth the most money right now."
      >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
          <span className="inline-flex rounded bg-critical-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-critical">Needs attention</span>
          {attentionCount === 0 ? (
            <p className="mt-3 text-[13px] text-text-muted">Nothing right now — every sold SKU has a cost, stock is above reorder levels, and every channel is healthy.</p>
          ) : (
            <ul className="mt-3 space-y-3 text-[13px]">
              {a.connectionErrors.map((c) => (
                <li key={c.label}>
                  <div className="font-medium text-critical">{c.label} has a problem</div>
                  <div className="text-text-muted">{c.error}</div>
                </li>
              ))}
              {a.failedEvents ? (
                <li>
                  <div className="font-medium text-critical">{a.failedEvents} order update(s) failed to apply</div>
                  <div className="text-text-muted">Saved and retried nightly. See <Link href="/settings" className="underline">Settings</Link>.</div>
                </li>
              ) : null}
              {a.unmatchedSkus.length ? (
                <li>
                  <div className="font-medium text-warning">Sold, but not in your product list</div>
                  <div className="text-text-muted">No cost on these yet, so profit is overstated. Add them in <Link href={ctx.href("/warehouse")} className="underline">Warehouse</Link>.</div>
                  <ul className="mt-1.5 space-y-0.5">
                    {a.unmatchedSkus.map((u) => (
                      <li key={`${u.brandName}-${u.sku}`} className="flex justify-between gap-2">
                        <span className="truncate font-mono text-xs">{u.sku}</span>
                        <span className="tnum text-text-faint">{u.lines} line(s)</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}
              {a.lowStock.length ? (
                <li>
                  <div className="font-medium text-warning">Low stock</div>
                  <ul className="mt-1.5 space-y-0.5">
                    {a.lowStock.slice(0, 8).map((s) => (
                      <li key={s.productId} className="flex justify-between gap-2">
                        <span className="truncate">{s.name}</span>
                        <span className="tnum text-text-faint">{s.onHand} left</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
          <span className="inline-flex rounded bg-healthy-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-healthy">Do this first</span>
          <p className="mt-3 text-[13px] leading-relaxed text-text">{nextMove(o, attentionCount)}</p>
        </div>
      </div>
      </Section>

      <p className="mt-6 text-[11px] text-text-faint">
        Sales and profit count an order on the day it is delivered. Orders placed count by the day the customer ordered. All times are Manila time.
      </p>
    </>
  );
}

/** The single most useful thing to do next, by a fixed order of priority. */
function nextMove(o: Overview, attentionCount: number): string {
  if (o.headroom != null && o.headroom < 1) return "Cut ad spend or the cost per order first — right now every extra order deepens the loss. Pause the weakest campaigns before anything else.";
  if (o.deliveredRate != null && o.deliveredRate < 0.6) return "Fix delivery before buying more orders: confirm orders by call or SMS before shipping, and check which couriers and provinces return the most.";
  if (attentionCount > 0) return "Clear the items under Needs attention — until every sold SKU has a cost, the profit shown is higher than the real one.";
  if (o.pnl.advertising === 0 && o.pnl.sales > 0) return "Record this period's ad spend in Accounting. Without it, profit and ROAS are overstated.";
  if (o.headroom != null && o.headroom >= 2.5) return "The numbers support scaling: raise budget on the best campaigns in steps, and watch ad headroom stay above 2×.";
  return "Keep the delivered rate up and the ad cost per order under the break-even line. Check back after the next batch of deliveries.";
}
