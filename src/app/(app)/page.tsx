import Link from "next/link";
import { Banner, Card, Empty, Filters, PageTitle, Stat, td, th } from "@/components/ui";
import { formatPeso } from "@/lib/money";
import { pageContext, type SearchParams } from "@/lib/page-context";
import { RANGE_LABEL } from "@/lib/period";
import { attention, overview } from "@/lib/reports";

const STATUS_ORDER = ["NEW", "CONFIRMED", "SHIPPED", "DELIVERED", "RETURNING", "RETURNED", "CANCELLED"] as const;
const STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  CONFIRMED: "Confirmed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  RETURNING: "Returning",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
};
const STATUS_COLOR: Record<string, string> = {
  NEW: "bg-stone-300",
  CONFIRMED: "bg-sky-300",
  SHIPPED: "bg-sky-500",
  DELIVERED: "bg-emerald-500",
  RETURNING: "bg-amber-400",
  RETURNED: "bg-red-500",
  CANCELLED: "bg-stone-400",
};

const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

export default async function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await pageContext(searchParams);

  if (!ctx.brands.length) {
    return (
      <>
        <PageTitle title="Welcome" hint="Three steps and the numbers start filling in." />
        <Card>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-stone-700">
            <li>
              <Link href="/settings" className="font-medium underline">
                Add your brands
              </Link>{" "}
              in Settings.
            </li>
            <li>Connect each brand&apos;s Pancake shop (Webcake orders arrive through it) or Shopify store, and paste the webhook address into the channel.</li>
            <li>
              Add your products and their costs in{" "}
              <Link href="/warehouse" className="font-medium underline">
                Warehouse
              </Link>
              , so profit and stock can be worked out.
            </li>
          </ol>
        </Card>
      </>
    );
  }

  const scope = { brandId: ctx.brand?.id ?? null };
  const [o, a, perBrand] = await Promise.all([
    overview(scope, ctx.period),
    attention(scope),
    ctx.brand ? Promise.resolve([]) : Promise.all(ctx.brands.map(async (b) => ({ brand: b, o: await overview({ brandId: b.id }, ctx.period) }))),
  ]);

  const { pnl, funnel, position: pos } = o;
  const rangeLabel = RANGE_LABEL[ctx.range].toLowerCase();
  const attentionCount = a.unmatchedSkus.length + a.lowStock.length + a.connectionErrors.length + (a.failedEvents ? 1 : 0);

  return (
    <>
      <PageTitle title={ctx.brand ? ctx.brand.name : "All brands"} />
      <Banner ok={ctx.ok} error={ctx.error} />
      <Filters ctx={ctx} path="/" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          big
          label="Net profit"
          value={formatPeso(pnl.netProfit)}
          tone={pnl.netProfit > 0 ? "good" : pnl.netProfit < 0 ? "bad" : "plain"}
          sub={pnl.sales > 0 ? `${((pnl.netProfit / pnl.sales) * 100).toFixed(1)}% of sales` : "after ads, goods and expenses"}
        />
        <Stat big label="Sales" value={formatPeso(pnl.sales)} sub={`delivered ${rangeLabel}`} />
        <Stat
          big
          label="Ad spend"
          value={formatPeso(pnl.advertising)}
          sub={o.roas == null ? "no ad spend recorded" : `ROAS ${o.roas.toFixed(2)}${o.costPerOrder ? ` · ${formatPeso(o.costPerOrder)} per order` : ""}`}
        />
        <Stat
          big
          label="Delivered rate"
          value={pct(o.deliveredRate)}
          tone={o.deliveredRate == null ? "plain" : o.deliveredRate >= 0.8 ? "good" : o.deliveredRate < 0.6 ? "bad" : "plain"}
          sub={`${funnel.delivered} delivered · ${funnel.returned} returned`}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cash" value={formatPeso(pos.cash)} tone={pos.cash < 0 ? "bad" : "plain"} sub="right now" />
        <Stat label="Owed to us" value={formatPeso(pos.receivable)} sub="couriers & gateways" />
        <Stat label="Stock on hand" value={formatPeso(o.stockValue)} sub="at cost" />
        <Stat label="Owed to suppliers" value={formatPeso(pos.payable)} sub="unpaid stock" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card title={`Orders placed ${rangeLabel}`} action={<span className="num text-sm text-stone-500">{funnel.orders} orders · {formatPeso(funnel.orderedValue)}</span>}>
            {funnel.orders === 0 ? (
              <Empty>No orders in this period yet.</Empty>
            ) : (
              <>
                <div className="flex h-3 overflow-hidden rounded-full bg-stone-100" role="img" aria-label="Orders by status">
                  {STATUS_ORDER.map((s) =>
                    funnel.byStatus[s] ? <div key={s} className={STATUS_COLOR[s]} style={{ width: `${(funnel.byStatus[s] / funnel.orders) * 100}%` }} /> : null,
                  )}
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                  {STATUS_ORDER.map((s) => (
                    <div key={s} className="flex items-center justify-between gap-2 text-sm">
                      <dt className="flex items-center gap-2 text-stone-600">
                        <span className={`h-2 w-2 rounded-full ${STATUS_COLOR[s]}`} />
                        {STATUS_LABEL[s]}
                      </dt>
                      <dd className="num font-medium">{funnel.byStatus[s] ?? 0}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </Card>

          {!ctx.brand && perBrand.length > 1 ? (
            <Card title="By brand">
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr>
                      <th className={th}>Brand</th>
                      <th className={`${th} text-right`}>Sales</th>
                      <th className={`${th} text-right`}>Ad spend</th>
                      <th className={`${th} text-right`}>Net profit</th>
                      <th className={`${th} text-right`}>Orders</th>
                      <th className={`${th} text-right`}>Delivered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {perBrand.map(({ brand, o: b }) => (
                      <tr key={brand.id}>
                        <td className={td}>
                          <Link href={ctx.href("/", { brand: brand.slug })} className="font-medium hover:underline">
                            {brand.name}
                          </Link>
                        </td>
                        <td className={`${td} num text-right`}>{formatPeso(b.pnl.sales)}</td>
                        <td className={`${td} num text-right`}>{formatPeso(b.pnl.advertising)}</td>
                        <td className={`${td} num text-right font-medium ${b.pnl.netProfit < 0 ? "text-red-700" : b.pnl.netProfit > 0 ? "text-emerald-700" : ""}`}>
                          {formatPeso(b.pnl.netProfit)}
                        </td>
                        <td className={`${td} num text-right`}>{b.funnel.orders}</td>
                        <td className={`${td} num text-right`}>{pct(b.deliveredRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </div>

        <Card title="Needs attention">
          {attentionCount === 0 ? (
            <Empty>Nothing right now.</Empty>
          ) : (
            <ul className="space-y-3 text-sm">
              {a.connectionErrors.map((c) => (
                <li key={c.label}>
                  <div className="font-medium text-red-700">{c.label} has a problem</div>
                  <div className="text-stone-500">{c.error}</div>
                </li>
              ))}
              {a.failedEvents ? (
                <li>
                  <div className="font-medium text-red-700">{a.failedEvents} order update(s) failed to apply</div>
                  <div className="text-stone-500">
                    They are saved and retried nightly. See <Link href="/settings" className="underline">Settings</Link>.
                  </div>
                </li>
              ) : null}
              {a.unmatchedSkus.length ? (
                <li>
                  <div className="font-medium text-amber-700">Sold, but not in your product list</div>
                  <div className="text-stone-500">These carry no cost, so profit is overstated until they are added in Warehouse.</div>
                  <ul className="mt-1.5 space-y-0.5">
                    {a.unmatchedSkus.map((u) => (
                      <li key={`${u.brandName}-${u.sku}`} className="flex justify-between gap-2">
                        <span className="truncate font-mono text-xs">{u.sku}</span>
                        <span className="num text-stone-500">{u.lines} line(s)</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}
              {a.lowStock.length ? (
                <li>
                  <div className="font-medium text-amber-700">Low stock</div>
                  <ul className="mt-1.5 space-y-0.5">
                    {a.lowStock.slice(0, 8).map((s) => (
                      <li key={s.productId} className="flex justify-between gap-2">
                        <span className="truncate">{s.name}</span>
                        <span className="num text-stone-500">{s.onHand} left</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}
            </ul>
          )}
        </Card>
      </div>

      <p className="mt-6 text-xs text-stone-400">
        Sales and profit count an order on the day it is delivered. The order bar counts orders by the day they were placed. All times are Manila time.
      </p>
    </>
  );
}
