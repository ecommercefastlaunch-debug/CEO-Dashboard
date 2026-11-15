// Applying one canonical order: the single path by which a sale changes the
// order book, the warehouse and the ledger — all three in one transaction, so
// they can never disagree with each other.

import { prisma, type Db } from "@/lib/prisma";
import { postEntry, postedBalances } from "@/lib/accounting/ledger";
import { deltaLines, desiredOrderBalances } from "@/lib/accounting/postings";
import { defaultWarehouse } from "@/lib/inventory/stock";
import { desiredOut, isOut, stockDelta } from "@/lib/inventory/rules";
import type { CanonicalOrder } from "./types";

export interface ConnectionRef {
  id: string;
  brandId: string;
  channel: "PANCAKE" | "SHOPIFY";
}

export interface ApplyResult {
  orderId: string;
  created: boolean;
  /** Line items whose SKU matched no product — they carry no cost and move no stock. */
  unmatchedSkus: string[];
}

export async function applyOrder(conn: ConnectionRef, o: CanonicalOrder, now: Date = new Date()): Promise<ApplyResult> {
  return prisma.$transaction(
    async (tx) => {
      // Two deliveries for the same order can arrive at once (Pancake fires on
      // every edit). Serialise them, or both would see "nothing posted yet".
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${conn.id}:${o.externalId}`}))`;

      const existing = await tx.order.findUnique({
        where: { connectionId_externalId: { connectionId: conn.id, externalId: o.externalId } },
        include: { items: true },
      });

      const eventAt = o.updatedAt ?? now;
      const out = isOut(o.status);

      // Match lines to products by SKU within the brand.
      const skus = [...new Set(o.items.map((i) => i.sku).filter((s): s is string => !!s))];
      const products = skus.length ? await tx.product.findMany({ where: { brandId: conn.brandId, sku: { in: skus } } }) : [];
      const bySku = new Map(products.map((p) => [p.sku, p]));

      // A line's cost is frozen the first time it ships, and carried forward on
      // every later update, so a cost change never rewrites an old order's profit.
      const frozen = new Map<string, number>();
      for (const it of existing?.items ?? []) {
        if (it.productId && it.unitCostCentavos != null) frozen.set(it.productId, it.unitCostCentavos);
      }
      const settled = out || o.status === "RETURNED";
      const items = o.items.map((it) => {
        const product = it.sku ? bySku.get(it.sku) : undefined;
        let unitCost: number | null = null;
        if (product) {
          unitCost = frozen.get(product.id) ?? (settled && product.unitCostCentavos > 0 ? product.unitCostCentavos : null);
        }
        return {
          sku: it.sku,
          name: it.name,
          quantity: it.quantity,
          unitPriceCentavos: it.unitPriceCentavos,
          productId: product?.id ?? null,
          unitCostCentavos: unitCost,
        };
      });

      const fields = {
        displayId: o.displayId,
        status: o.status,
        rawStatus: o.rawStatus,
        placedAt: o.placedAt,
        // Each milestone is stamped once, the first time the order reaches it.
        shippedAt: existing?.shippedAt ?? (out ? eventAt : null),
        deliveredAt: existing?.deliveredAt ?? (o.status === "DELIVERED" ? eventAt : null),
        returnedAt: existing?.returnedAt ?? (o.status === "RETURNED" ? eventAt : null),
        totalCentavos: o.totalCentavos,
        shippingCentavos: o.shippingCentavos,
        discountCentavos: o.discountCentavos,
        courierFeeCentavos: o.courierFeeCentavos,
        isCod: o.isCod,
        isAbandonedCart: o.isAbandonedCart,
        customerName: o.customerName,
        phone: o.phone,
        province: o.province,
        courier: o.courier,
        returnReason: o.returnReason,
        landingLink: o.landingLink,
        utmSource: o.utmSource,
        utmMedium: o.utmMedium,
        utmCampaign: o.utmCampaign,
        utmContent: o.utmContent,
      };

      // `excludedAt` is never touched here: an order an operator hid must not be
      // resurrected because the channel edited it.
      const order = existing
        ? await tx.order.update({ where: { id: existing.id }, data: fields })
        : await tx.order.create({
            data: { ...fields, brandId: conn.brandId, connectionId: conn.id, channel: conn.channel, externalId: o.externalId },
          });

      await tx.orderItem.deleteMany({ where: { orderId: order.id } });
      if (items.length) await tx.orderItem.createMany({ data: items.map((it) => ({ ...it, orderId: order.id })) });

      await syncOrderEffects(tx, order.id, eventAt);

      return {
        orderId: order.id,
        created: !existing,
        unmatchedSkus: items.filter((it) => !it.productId).map((it) => it.sku ?? it.name ?? "(no SKU)"),
      };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}

/**
 * Bring the warehouse and the ledger into line with an order as it stands.
 * Safe to call any number of times; it posts only what is missing. Also used
 * after an operator excludes/restores an order or maps a SKU to a product.
 */
export async function syncOrderEffects(db: Db, orderId: string, at: Date = new Date()): Promise<void> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  const label = `${order.channel === "PANCAKE" ? "Pancake" : "Shopify"} order ${order.displayId ?? order.externalId}`;

  // ── Warehouse ──
  const posted = await db.stockMovement.groupBy({ by: ["productId"], where: { orderId: order.id }, _sum: { quantity: true } });
  const postedNet: Record<string, number> = {};
  for (const p of posted) postedNet[p.productId] = p._sum.quantity ?? 0;
  const moves = stockDelta(desiredOut(order.status, order.items), postedNet);
  if (moves.length) {
    const warehouse = await defaultWarehouse(db);
    const costs = new Map(order.items.filter((i) => i.productId).map((i) => [i.productId as string, i.unitCostCentavos ?? 0]));
    await db.stockMovement.createMany({
      data: moves.map((m) => ({
        productId: m.productId,
        warehouseId: warehouse.id,
        type: m.quantity < 0 ? ("SHIPMENT" as const) : ("RETURN" as const),
        quantity: m.quantity,
        unitCostCentavos: costs.get(m.productId) ?? 0,
        orderId: order.id,
        note: label,
        occurredAt: at,
      })),
    });
  }

  // ── Ledger ──
  const cogs = order.items.reduce((sum, it) => sum + it.quantity * (it.unitCostCentavos ?? 0), 0);
  const desired = desiredOrderBalances({
    status: order.status,
    excluded: order.excludedAt != null,
    totalCentavos: order.totalCentavos,
    courierFeeCentavos: order.courierFeeCentavos,
    cogsCentavos: cogs,
  });
  const lines = deltaLines(desired, await postedBalances(db, "ORDER", order.id));
  if (lines.length) {
    await postEntry(db, {
      brandId: order.brandId,
      date: at,
      memo: `${label} — ${order.excludedAt ? "excluded" : order.status.toLowerCase()}`,
      sourceType: "ORDER",
      sourceId: order.id,
      lines,
    });
  }
}

/**
 * After a product is created or its cost is first set: attach it to order lines
 * that were waiting for it, and post the stock and cost those orders should
 * have carried. Entries are dated when the order actually settled, so the
 * correction lands in the right month rather than today.
 */
export async function linkProductToOrders(productId: string): Promise<number> {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  const waiting = await prisma.orderItem.findMany({
    where: {
      OR: [
        { productId: null, sku: product.sku, order: { brandId: product.brandId } },
        { productId: product.id, unitCostCentavos: null },
      ],
    },
    select: { orderId: true },
  });
  const orderIds = [...new Set(waiting.map((w) => w.orderId))];

  for (const orderId of orderIds) {
    await prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${order.connectionId}:${order.externalId}`}))`;
        await tx.orderItem.updateMany({ where: { orderId, productId: null, sku: product.sku }, data: { productId: product.id } });
        const settled = isOut(order.status) || order.status === "RETURNED";
        if (settled && product.unitCostCentavos > 0) {
          await tx.orderItem.updateMany({
            where: { orderId, productId: product.id, unitCostCentavos: null },
            data: { unitCostCentavos: product.unitCostCentavos },
          });
        }
        await syncOrderEffects(tx, orderId, order.deliveredAt ?? order.returnedAt ?? order.shippedAt ?? new Date());
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  }
  return orderIds.length;
}
