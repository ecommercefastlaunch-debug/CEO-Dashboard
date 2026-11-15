// Every number a screen or a bot shows comes from here, so the dashboard, the
// accounting page and the bot API can never disagree.

import { prisma } from "@/lib/prisma";
import { A, ACCOUNTS, account } from "@/lib/accounting/accounts";
import type { Balances } from "@/lib/accounting/postings";
import type { Period } from "@/lib/period";

export interface Scope {
  /** Null = all brands. */
  brandId: string | null;
}

/** Signed balance per account (debit positive) for entries dated in the period. */
export async function ledgerBalances(scope: Scope, period?: Period | null, upTo?: Date): Promise<Balances> {
  const rows = await prisma.journalLine.groupBy({
    by: ["accountCode"],
    where: {
      entry: {
        brandId: scope.brandId ?? undefined,
        date: period ? { gte: period.from, lt: period.to } : upTo ? { lt: upTo } : undefined,
      },
    },
    _sum: { debitCentavos: true, creditCentavos: true },
  });
  const b: Balances = {};
  for (const r of rows) {
    const v = (r._sum.debitCentavos ?? 0) - (r._sum.creditCentavos ?? 0);
    // An account that nets to zero is left out, not reported as ₱0.
    if (v !== 0) b[r.accountCode] = v;
  }
  return b;
}

export interface ProfitAndLoss {
  sales: number;
  cogs: number;
  grossProfit: number;
  advertising: number;
  expenses: { code: string; name: string; amount: number }[];
  totalExpenses: number;
  netProfit: number;
}

/** Shape period balances into a P&L. All figures positive-is-normal. */
export function profitAndLoss(b: Balances): ProfitAndLoss {
  const sales = -(b[A.SALES] ?? 0);
  const cogs = b[A.COGS] ?? 0;
  const expenses = ACCOUNTS.filter((a) => a.type === "EXPENSE")
    .map((a) => ({ code: a.code, name: a.name, amount: b[a.code] ?? 0 }))
    .filter((e) => e.amount !== 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  return {
    sales,
    cogs,
    grossProfit: sales - cogs,
    advertising: b[A.ADVERTISING] ?? 0,
    expenses,
    totalExpenses,
    netProfit: sales - cogs - totalExpenses,
  };
}

export interface Position {
  cash: number;
  receivable: number;
  inventory: number;
  payable: number;
}

/** Where the money stands right now (all time, not a period). */
export function position(b: Balances): Position {
  return {
    cash: b[A.CASH] ?? 0,
    receivable: b[A.RECEIVABLE] ?? 0,
    inventory: b[A.INVENTORY] ?? 0,
    payable: -(b[A.PAYABLE] ?? 0),
  };
}

export interface Funnel {
  orders: number;
  byStatus: Record<string, number>;
  /** Value of everything ordered in the period, whatever became of it. */
  orderedValue: number;
  delivered: number;
  returned: number;
  /** Still open: not yet delivered, returned or cancelled. */
  inFlight: number;
}

/** Orders PLACED in the period, by what has become of them since. */
export async function orderFunnel(scope: Scope, period: Period): Promise<Funnel> {
  const rows = await prisma.order.groupBy({
    by: ["status"],
    where: {
      brandId: scope.brandId ?? undefined,
      placedAt: { gte: period.from, lt: period.to },
      excludedAt: null,
      isAbandonedCart: false,
    },
    _count: { _all: true },
    _sum: { totalCentavos: true },
  });
  const byStatus: Record<string, number> = {};
  let orders = 0;
  let orderedValue = 0;
  for (const r of rows) {
    byStatus[r.status] = r._count._all;
    orders += r._count._all;
    orderedValue += r._sum.totalCentavos ?? 0;
  }
  const delivered = byStatus.DELIVERED ?? 0;
  const returned = (byStatus.RETURNED ?? 0) + (byStatus.RETURNING ?? 0);
  const inFlight = (byStatus.NEW ?? 0) + (byStatus.CONFIRMED ?? 0) + (byStatus.SHIPPED ?? 0);
  return { orders, byStatus, orderedValue, delivered, returned, inFlight };
}

export interface StockRow {
  productId: string;
  brandId: string;
  brandName: string;
  sku: string;
  name: string;
  onHand: number;
  unitCostCentavos: number;
  valueCentavos: number;
  reorderPoint: number;
  low: boolean;
}

export async function stockRows(scope: Scope, warehouseId?: string): Promise<StockRow[]> {
  const [products, sums] = await Promise.all([
    prisma.product.findMany({
      where: { brandId: scope.brandId ?? undefined, active: true },
      include: { brand: { select: { name: true } } },
      orderBy: [{ brand: { name: "asc" } }, { sku: "asc" }],
    }),
    prisma.stockMovement.groupBy({
      by: ["productId"],
      where: { warehouseId, product: { brandId: scope.brandId ?? undefined } },
      _sum: { quantity: true },
    }),
  ]);
  const qty = new Map(sums.map((s) => [s.productId, s._sum.quantity ?? 0]));
  return products.map((p) => {
    const onHand = qty.get(p.id) ?? 0;
    return {
      productId: p.id,
      brandId: p.brandId,
      brandName: p.brand.name,
      sku: p.sku,
      name: p.name,
      onHand,
      unitCostCentavos: p.unitCostCentavos,
      valueCentavos: Math.max(0, onHand) * p.unitCostCentavos,
      reorderPoint: p.reorderPoint,
      low: onHand <= p.reorderPoint,
    };
  });
}

export interface Attention {
  /** SKUs that arrived on orders but match no product, with how many lines. */
  unmatchedSkus: { sku: string; brandName: string; lines: number }[];
  lowStock: StockRow[];
  failedEvents: number;
  connectionErrors: { label: string; brandName: string; error: string }[];
}

/** The short list of things that make the numbers wrong until someone acts. */
export async function attention(scope: Scope): Promise<Attention> {
  const brand = scope.brandId ?? undefined;
  const [unmatched, stock, failedEvents, connections] = await Promise.all([
    prisma.orderItem.groupBy({
      by: ["sku"],
      where: { productId: null, order: { brandId: brand, excludedAt: null, status: { in: ["SHIPPED", "DELIVERED", "RETURNING", "RETURNED"] } } },
      _count: { _all: true },
      orderBy: { _count: { sku: "desc" } },
      take: 10,
    }),
    stockRows(scope),
    prisma.webhookEvent.count({ where: { status: "ERROR", connection: { brandId: brand } } }),
    prisma.channelConnection.findMany({
      where: { brandId: brand, lastError: { not: null } },
      select: { label: true, lastError: true, brand: { select: { name: true } } },
    }),
  ]);

  // groupBy cannot reach the brand, so resolve one example order per SKU.
  const unmatchedSkus = [];
  for (const u of unmatched) {
    const example = await prisma.orderItem.findFirst({
      where: { sku: u.sku, productId: null, order: { brandId: brand } },
      select: { order: { select: { brand: { select: { name: true } } } } },
    });
    unmatchedSkus.push({ sku: u.sku ?? "(no SKU)", brandName: example?.order.brand.name ?? "", lines: u._count._all });
  }

  return {
    unmatchedSkus,
    lowStock: stock.filter((s) => s.low && s.reorderPoint > 0),
    failedEvents,
    connectionErrors: connections.map((c) => ({ label: c.label, brandName: c.brand.name, error: c.lastError ?? "" })),
  };
}

export interface Overview {
  pnl: ProfitAndLoss;
  position: Position;
  funnel: Funnel;
  stockValue: number;
  /** Sales ÷ advertising for the period. Null when nothing was spent. */
  roas: number | null;
  /** Advertising ÷ orders placed. Null when there were no orders. */
  costPerOrder: number | null;
  /** Delivered ÷ (delivered + returned), of orders placed in the period. */
  deliveredRate: number | null;
}

export async function overview(scope: Scope, period: Period): Promise<Overview> {
  const [periodBalances, allBalances, funnel, stock] = await Promise.all([
    ledgerBalances(scope, period),
    ledgerBalances(scope, null),
    orderFunnel(scope, period),
    stockRows(scope),
  ]);
  const pnl = profitAndLoss(periodBalances);
  const settled = funnel.delivered + funnel.returned;
  return {
    pnl,
    position: position(allBalances),
    funnel,
    stockValue: stock.reduce((s, r) => s + r.valueCentavos, 0),
    roas: pnl.advertising > 0 ? pnl.sales / pnl.advertising : null,
    costPerOrder: funnel.orders > 0 && pnl.advertising > 0 ? Math.round(pnl.advertising / funnel.orders) : null,
    deliveredRate: settled > 0 ? funnel.delivered / settled : null,
  };
}

export { account };
