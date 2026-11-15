import { NextResponse, type NextRequest } from "next/server";
import { authenticateBot, periodFromQuery, pesos } from "@/lib/bot";
import { attention, overview } from "@/lib/reports";

/** GET /api/bot/v1/summary?brand=<code|all>&range=today|yesterday|7d|30d|mtd */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await authenticateBot(req);
  if (ctx instanceof NextResponse) return ctx;
  const p = periodFromQuery(req);
  if (p instanceof NextResponse) return p;

  const scope = { brandId: ctx.brandId };
  const [o, a] = await Promise.all([overview(scope, p.period), attention(scope)]);
  return NextResponse.json({
    ok: true,
    brand: ctx.brandName,
    period: { label: p.label, from: p.period.from.toISOString(), to: p.period.to.toISOString(), timezone: "Asia/Manila" },
    currency: "PHP",
    profit_and_loss: {
      note: "Sales are counted on the day an order is DELIVERED, not the day it was placed.",
      sales: pesos(o.pnl.sales),
      cost_of_goods_sold: pesos(o.pnl.cogs),
      gross_profit: pesos(o.pnl.grossProfit),
      advertising: pesos(o.pnl.advertising),
      expenses: o.pnl.expenses.map((e) => ({ name: e.name, amount: pesos(e.amount) })),
      total_expenses: pesos(o.pnl.totalExpenses),
      net_profit: pesos(o.pnl.netProfit),
      roas: o.roas == null ? null : Number(o.roas.toFixed(2)),
    },
    orders_placed_in_period: {
      count: o.funnel.orders,
      value: pesos(o.funnel.orderedValue),
      by_status: o.funnel.byStatus,
      delivered_rate: o.deliveredRate == null ? null : Number(o.deliveredRate.toFixed(4)),
      advertising_cost_per_order: o.costPerOrder == null ? null : pesos(o.costPerOrder),
    },
    position_now: {
      cash: pesos(o.position.cash),
      owed_to_us_by_couriers_and_gateways: pesos(o.position.receivable),
      owed_by_us_to_suppliers: pesos(o.position.payable),
      stock_on_hand_value: pesos(o.stockValue),
    },
    needs_attention: {
      unmatched_skus: a.unmatchedSkus,
      low_stock: a.lowStock.map((s) => ({ brand: s.brandName, sku: s.sku, name: s.name, on_hand: s.onHand, reorder_point: s.reorderPoint })),
      failed_webhook_events: a.failedEvents,
    },
  });
}
