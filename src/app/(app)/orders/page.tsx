import Link from "next/link";
import { setOrderExcluded } from "@/app/actions";
import { PageControls } from "@/components/page-controls";
import { Back, Banner, Card, PageHeader, Pill, cn, tableBody, tableHead, td, th, type Tone } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { formatPeso } from "@/lib/money";
import { pageContext, type SearchParams } from "@/lib/page-context";
import type { OrderStatus } from "@/generated/prisma/client";

const STATUSES = ["NEW", "CONFIRMED", "SHIPPED", "DELIVERED", "RETURNING", "RETURNED", "CANCELLED"] as const;
const TONE: Record<string, Tone> = {
  NEW: "neutral",
  CONFIRMED: "info",
  SHIPPED: "info",
  DELIVERED: "healthy",
  RETURNING: "warning",
  RETURNED: "critical",
  CANCELLED: "neutral",
};

const PAGE = 100;

const when = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await pageContext(searchParams);
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status) as OrderStatus | undefined;
  const showExcluded = sp.excluded === "1";

  const where = {
    brandId: ctx.brand?.id,
    placedAt: { gte: ctx.period.from, lt: ctx.period.to },
    status,
    excludedAt: showExcluded ? { not: null } : null,
  };
  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      take: PAGE,
      include: { brand: { select: { name: true } }, items: { select: { sku: true, name: true, quantity: true, productId: true } } },
    }),
  ]);

  const base = ctx.href("/orders");
  const withParam = (k: string, v: string | null) => {
    const u = new URL(base, "http://x");
    if (status && k !== "status") u.searchParams.set("status", status);
    if (showExcluded && k !== "excluded") u.searchParams.set("excluded", "1");
    if (v) u.searchParams.set(k, v);
    return u.pathname + u.search;
  };
  const here = withParam("", null);
  const chip = (active: boolean) =>
    cn(
      "whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
      active ? "bg-ink text-on-ink" : "text-text-muted hover:bg-surface-2 hover:text-text",
    );

  return (
    <>
      <PageHeader
        title={ctx.brand ? `Orders — ${ctx.brand.name}` : "Orders"}
        description="Every order from Pancake, Webcake and Shopify, in one list."
        actions={<PageControls ctx={ctx} />}
      />
      <Banner ok={ctx.ok} error={ctx.error} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-surface p-0.5 shadow-card">
          <Link href={withParam("status", null)} className={chip(!status)}>
            Any status
          </Link>
          {STATUSES.map((s) => (
            <Link key={s} href={withParam("status", s)} className={chip(status === s)}>
              {s[0] + s.slice(1).toLowerCase()}
            </Link>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 shadow-card">
          <Link href={withParam("excluded", showExcluded ? null : "1")} className={chip(showExcluded)}>
            Excluded only
          </Link>
        </div>
      </div>

      <Card
        flush
        title={`${total.toLocaleString("en-PH")} order${total === 1 ? "" : "s"}`}
        subtitle={showExcluded ? "Hidden from every number. Restore one to count it again." : "Newest first. Exclude test or fraud orders to hide them from every number."}
      >
        {orders.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-text-faint">No orders match.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px]">
              <thead className={tableHead}>
                <tr>
                  <th className={th}>Order</th>
                  <th className={th}>Placed</th>
                  <th className={th}>Customer</th>
                  <th className={th}>Items</th>
                  <th className={`${th} text-right`}>Total</th>
                  <th className={th}>Status</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className={tableBody}>
                {orders.map((o) => (
                  <tr key={o.id} className="align-top hover:bg-surface-2/50">
                    <td className={td}>
                      <div className="font-medium">{o.displayId ?? o.externalId}</div>
                      <div className="text-xs text-text-faint">
                        {o.brand.name} · {o.channel === "PANCAKE" ? "Pancake" : "Shopify"}
                      </div>
                    </td>
                    <td className={`${td} whitespace-nowrap text-text-muted`}>{when.format(o.placedAt)}</td>
                    <td className={td}>
                      <div>{o.customerName ?? "—"}</div>
                      <div className="text-xs text-text-faint">{o.province ?? ""}</div>
                    </td>
                    <td className={td}>
                      {o.items.map((it, i) => (
                        <div key={i} className="text-xs">
                          {it.quantity} × {it.name ?? it.sku ?? "item"}
                          {!it.productId ? <span className="ml-1 text-warning" title="This SKU isn't in your product list">(no product)</span> : null}
                        </div>
                      ))}
                    </td>
                    <td className={`${td} text-right font-medium tnum`}>{formatPeso(o.totalCentavos)}</td>
                    <td className={td}>
                      <Pill tone={TONE[o.status] ?? "neutral"}>{o.status.toLowerCase()}</Pill>
                      {o.excludedAt ? <div className="mt-1 text-xs text-text-faint">{o.excludedReason}</div> : null}
                    </td>
                    <td className={`${td} text-right`}>
                      <form action={setOrderExcluded}>
                        <Back to={here} />
                        <input type="hidden" name="orderId" value={o.id} />
                        <input type="hidden" name="exclude" value={o.excludedAt ? "0" : "1"} />
                        <button
                          type="submit"
                          className="h-7 rounded-md px-2 text-xs font-medium text-text-muted hover:bg-surface-2 hover:text-text"
                          title={o.excludedAt ? "Count this order again" : "Hide this order from every number (test or fraud). Can be undone."}
                        >
                          {o.excludedAt ? "Restore" : "Exclude"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > orders.length ? (
          <p className="border-t border-border px-4 py-2.5 text-xs text-text-muted">
            Showing the newest {orders.length} of {total}. Narrow the period or status to see the rest.
          </p>
        ) : null}
      </Card>
    </>
  );
}
