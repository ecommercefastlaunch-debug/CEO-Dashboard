import Link from "next/link";
import { setOrderExcluded } from "@/app/actions";
import { Back, Banner, Card, Empty, Filters, PageTitle, td, th } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { formatPeso } from "@/lib/money";
import { pageContext, type SearchParams } from "@/lib/page-context";
import type { OrderStatus } from "@/generated/prisma/client";

const STATUSES = ["NEW", "CONFIRMED", "SHIPPED", "DELIVERED", "RETURNING", "RETURNED", "CANCELLED"] as const;
const TONE: Record<string, string> = {
  DELIVERED: "bg-emerald-50 text-emerald-700",
  RETURNED: "bg-red-50 text-red-700",
  RETURNING: "bg-amber-50 text-amber-700",
  CANCELLED: "bg-stone-100 text-stone-500",
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
    `rounded-full px-2.5 py-1 text-xs whitespace-nowrap ${active ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"}`;

  return (
    <>
      <PageTitle title="Orders" hint="Every order from every channel, in one list." />
      <Banner ok={ctx.ok} error={ctx.error} />
      <Filters ctx={ctx} path="/orders" />

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Link href={withParam("status", null)} className={chip(!status)}>
          Any status
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={withParam("status", s)} className={chip(status === s)}>
            {s[0] + s.slice(1).toLowerCase()}
          </Link>
        ))}
        <span className="mx-1 text-stone-300">|</span>
        <Link href={withParam("excluded", showExcluded ? null : "1")} className={chip(showExcluded)}>
          Excluded
        </Link>
      </div>

      <Card>
        {orders.length === 0 ? (
          <Empty>No orders match.</Empty>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
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
              <tbody className="divide-y divide-stone-100">
                {orders.map((o) => (
                  <tr key={o.id} className="align-top">
                    <td className={td}>
                      <div className="font-medium">{o.displayId ?? o.externalId}</div>
                      <div className="text-xs text-stone-500">
                        {o.brand.name} · {o.channel === "PANCAKE" ? "Pancake" : "Shopify"}
                      </div>
                    </td>
                    <td className={`${td} whitespace-nowrap text-stone-600`}>{when.format(o.placedAt)}</td>
                    <td className={td}>
                      <div>{o.customerName ?? "—"}</div>
                      <div className="text-xs text-stone-500">{o.province ?? ""}</div>
                    </td>
                    <td className={td}>
                      {o.items.map((it, i) => (
                        <div key={i} className="text-xs">
                          {it.quantity} × {it.name ?? it.sku ?? "item"}
                          {!it.productId ? <span className="ml-1 text-amber-700" title="This SKU isn't in your product list">(no product)</span> : null}
                        </div>
                      ))}
                    </td>
                    <td className={`${td} num text-right`}>{formatPeso(o.totalCentavos)}</td>
                    <td className={td}>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[o.status] ?? "bg-sky-50 text-sky-700"}`}>
                        {o.status[0] + o.status.slice(1).toLowerCase()}
                      </span>
                      {o.excludedAt ? <div className="mt-1 text-xs text-stone-500">{o.excludedReason}</div> : null}
                    </td>
                    <td className={`${td} text-right`}>
                      <form action={setOrderExcluded}>
                        <Back to={here} />
                        <input type="hidden" name="orderId" value={o.id} />
                        <input type="hidden" name="exclude" value={o.excludedAt ? "0" : "1"} />
                        <button type="submit" className="text-xs text-stone-500 underline hover:text-stone-900" title={o.excludedAt ? "Count this order again" : "Hide this order from every number (test or fraud). Can be undone."}>
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
        {total > orders.length ? <p className="mt-3 text-xs text-stone-500">Showing the newest {orders.length} of {total}. Narrow the date range or status to see the rest.</p> : null}
      </Card>
    </>
  );
}
