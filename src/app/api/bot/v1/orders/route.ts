import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateBot, botError, periodFromQuery, pesos } from "@/lib/bot";
import type { OrderStatus } from "@/generated/prisma/client";

/**
 * GET /api/bot/v1/orders?brand=<code|all>&range=7d&status=RETURNED&limit=50
 *
 * Customer names and phone numbers are deliberately not returned: a bot can
 * count and total orders, not read out who bought.
 */
export const dynamic = "force-dynamic";

const STATUSES = ["NEW", "CONFIRMED", "SHIPPED", "DELIVERED", "RETURNING", "RETURNED", "CANCELLED"];

export async function GET(req: NextRequest) {
  const ctx = await authenticateBot(req);
  if (ctx instanceof NextResponse) return ctx;
  const p = periodFromQuery(req);
  if (p instanceof NextResponse) return p;

  const q = req.nextUrl.searchParams;
  const status = q.get("status")?.toUpperCase();
  if (status && !STATUSES.includes(status)) return botError(400, `status must be one of: ${STATUSES.join(", ")}.`);
  const limit = Math.min(200, Math.max(1, Number(q.get("limit") ?? 50) || 50));

  const where = {
    brandId: ctx.brandId ?? undefined,
    placedAt: { gte: p.period.from, lt: p.period.to },
    excludedAt: null,
    isAbandonedCart: false,
    status: status ? (status as OrderStatus) : undefined,
  };
  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      take: limit,
      include: { brand: { select: { name: true } }, items: { select: { sku: true, name: true, quantity: true } } },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    brand: ctx.brandName,
    period: { label: p.label, timezone: "Asia/Manila" },
    currency: "PHP",
    total_matching: total,
    shown: orders.length,
    orders: orders.map((o) => ({
      brand: o.brand.name,
      channel: o.channel,
      order_number: o.displayId ?? o.externalId,
      status: o.status,
      placed_at: o.placedAt.toISOString(),
      total: pesos(o.totalCentavos),
      province: o.province,
      courier: o.courier,
      return_reason: o.returnReason,
      items: o.items,
    })),
  });
}
