// End-to-end against a real Postgres: an order's whole life, and what it does
// to the order book, the warehouse and the ledger together.
//
// Runs only when TEST_DATABASE_URL is set (see tests/setup.ts).

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { A } from "@/lib/accounting/accounts";
import { mapPancakeOrder } from "@/lib/channels/pancake";

const hasDb = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!hasDb)("an order's life, in the database", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let applyOrder: typeof import("@/lib/orders/apply").applyOrder;
  let syncOrderEffects: typeof import("@/lib/orders/apply").syncOrderEffects;
  let linkProductToOrders: typeof import("@/lib/orders/apply").linkProductToOrders;
  let receiveStock: typeof import("@/lib/inventory/stock").receiveStock;
  let adjustStock: typeof import("@/lib/inventory/stock").adjustStock;
  let onHand: typeof import("@/lib/inventory/stock").onHand;
  let ledgerBalances: typeof import("@/lib/reports").ledgerBalances;
  let processEvent: typeof import("@/lib/channels/process").processEvent;

  let conn: { id: string; brandId: string; channel: "PANCAKE" };
  let productId: string;
  let warehouseId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    ({ applyOrder, syncOrderEffects, linkProductToOrders } = await import("@/lib/orders/apply"));
    ({ receiveStock, adjustStock, onHand } = await import("@/lib/inventory/stock"));
    ({ ledgerBalances } = await import("@/lib/reports"));
    ({ processEvent } = await import("@/lib/channels/process"));
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "JournalLine","JournalEntry","StockMovement","OrderItem","Order","WebhookEvent","ChannelConnection","Product","ApiKey","Warehouse","Brand" CASCADE',
    );
    const brand = await prisma.brand.create({ data: { name: "Test Brand", slug: "test" } });
    const c = await prisma.channelConnection.create({
      data: { brandId: brand.id, channel: "PANCAKE", label: "Pancake", webhookKey: "k1" },
    });
    conn = { id: c.id, brandId: brand.id, channel: "PANCAKE" };
    const wh = await prisma.warehouse.create({ data: { name: "Main", isDefault: true } });
    warehouseId = wh.id;
    const p = await prisma.product.create({ data: { brandId: brand.id, sku: "SER-30", name: "Serum" } });
    productId = p.id;
    // 10 units at ₱300 each, paid in cash.
    await receiveStock({ productId, warehouseId, quantity: 10, unitCostCentavos: 30000, paidInCash: true });
  });

  const pancake = (status_name: string, over: Record<string, unknown> = {}) =>
    mapPancakeOrder({
      id: 1001,
      status_name,
      inserted_at: "2026-11-10T02:00:00Z",
      updated_at: "2026-11-12T02:00:00Z",
      cod: 149000,
      partner_fee: 10000,
      items: [{ quantity: 2, variation_info: { name: "Serum", display_id: "SER-30", retail_price: 74500 } }],
      ...over,
    })!;

  const balances = () => ledgerBalances({ brandId: conn.brandId }, null);
  const entryCount = () => prisma.journalEntry.count({ where: { sourceType: "ORDER" } });

  async function expectTrialBalance() {
    const sum = await prisma.journalLine.aggregate({ _sum: { debitCentavos: true, creditCentavos: true } });
    expect(sum._sum.debitCentavos).toBe(sum._sum.creditCentavos);
  }

  it("the receipt put stock on the shelf and took cash", async () => {
    expect(await onHand(prisma, productId)).toBe(10);
    expect(await balances()).toEqual({ [A.INVENTORY]: 300000, [A.CASH]: -300000 });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).unitCostCentavos).toBe(30000);
  });

  it("a new order changes nothing but the order book", async () => {
    const r = await applyOrder(conn, pancake("new"));
    expect(r.created).toBe(true);
    expect(r.unmatchedSkus).toEqual([]);
    expect(await onHand(prisma, productId)).toBe(10);
    expect(await entryCount()).toBe(0);
  });

  it("shipping takes the units off the shelf but books no sale yet", async () => {
    await applyOrder(conn, pancake("new"));
    await applyOrder(conn, pancake("shipped"));
    expect(await onHand(prisma, productId)).toBe(8);
    expect(await entryCount()).toBe(0);
    const order = await prisma.order.findFirstOrThrow({ include: { items: true } });
    expect(order.shippedAt).not.toBeNull();
    expect(order.items[0].unitCostCentavos).toBe(30000); // cost frozen at shipping
  });

  it("delivery books the sale, the cost of goods and the courier fee", async () => {
    await applyOrder(conn, pancake("shipped"));
    await applyOrder(conn, pancake("delivered"));
    expect(await balances()).toEqual({
      [A.CASH]: -300000,
      [A.INVENTORY]: 300000 - 60000,
      [A.RECEIVABLE]: 139000,
      [A.SALES]: -149000,
      [A.COGS]: 60000,
      [A.SHIPPING]: 10000,
    });
    expect(await onHand(prisma, productId)).toBe(8);
    await expectTrialBalance();
  });

  it("the same delivery twice posts nothing the second time", async () => {
    await applyOrder(conn, pancake("delivered"));
    const before = await entryCount();
    await applyOrder(conn, pancake("delivered"));
    await applyOrder(conn, pancake("delivered"));
    expect(await entryCount()).toBe(before);
    expect(await prisma.stockMovement.count({ where: { orderId: { not: null } } })).toBe(1);
    expect(await onHand(prisma, productId)).toBe(8);
  });

  it("five copies arriving at once still post one sale", async () => {
    await Promise.all(Array.from({ length: 5 }, () => applyOrder(conn, pancake("delivered"))));
    expect(await prisma.order.count()).toBe(1);
    expect((await balances())[A.SALES]).toBe(-149000);
    expect(await onHand(prisma, productId)).toBe(8);
    await expectTrialBalance();
  });

  it("a delivered order that comes back is fully unwound, except the courier fee", async () => {
    await applyOrder(conn, pancake("delivered"));
    await applyOrder(conn, pancake("returned"));
    expect(await balances()).toEqual({
      [A.CASH]: -300000,
      [A.INVENTORY]: 300000,
      [A.RECEIVABLE]: -10000,
      [A.SHIPPING]: 10000,
    });
    expect(await onHand(prisma, productId)).toBe(10);
    await expectTrialBalance();
  });

  it("an RTS that was never delivered costs only the courier fee", async () => {
    await applyOrder(conn, pancake("shipped"));
    await applyOrder(conn, pancake("returning"));
    expect(await onHand(prisma, productId)).toBe(8); // still out
    await applyOrder(conn, pancake("returned"));
    expect(await onHand(prisma, productId)).toBe(10);
    const b = await balances();
    expect(b[A.SALES]).toBeUndefined();
    expect(b[A.SHIPPING]).toBe(10000);
  });

  it("a cancelled order leaves no trace in stock or ledger", async () => {
    await applyOrder(conn, pancake("shipped"));
    await applyOrder(conn, pancake("canceled"));
    expect(await onHand(prisma, productId)).toBe(10);
    expect(await balances()).toEqual({ [A.INVENTORY]: 300000, [A.CASH]: -300000 });
  });

  it("an amount edited after delivery is corrected, not duplicated", async () => {
    await applyOrder(conn, pancake("delivered"));
    await applyOrder(conn, pancake("delivered", { cod: 99000 }));
    const b = await balances();
    expect(b[A.SALES]).toBe(-99000);
    expect(b[A.RECEIVABLE]).toBe(89000);
    await expectTrialBalance();
  });

  it("a later cost change does not rewrite an old order's profit", async () => {
    await applyOrder(conn, pancake("delivered"));
    await receiveStock({ productId, warehouseId, quantity: 10, unitCostCentavos: 50000, paidInCash: false });
    await applyOrder(conn, pancake("delivered", { note: "edited" }));
    expect((await balances())[A.COGS]).toBe(60000);
  });

  it("an unknown SKU sells with no cost until the product is created, then catches up", async () => {
    const o = pancake("delivered", { id: 2002, items: [{ quantity: 3, variation_info: { name: "Cream", display_id: "CRM-50" } }] });
    const r = await applyOrder(conn, o);
    expect(r.unmatchedSkus).toEqual(["CRM-50"]);
    expect((await balances())[A.COGS]).toBeUndefined();

    const cream = await prisma.product.create({ data: { brandId: conn.brandId, sku: "CRM-50", name: "Cream", unitCostCentavos: 20000 } });
    expect(await linkProductToOrders(cream.id)).toBe(1);
    expect((await balances())[A.COGS]).toBe(60000);
    expect(await onHand(prisma, cream.id)).toBe(-3); // sold before it was ever received — visible, not hidden
    // Dated when the order was delivered, not today.
    const entry = await prisma.journalEntry.findFirstOrThrow({ where: { sourceType: "ORDER" }, orderBy: { createdAt: "desc" } });
    expect(entry.date.toISOString()).toBe("2026-11-12T02:00:00.000Z");
    expect(await linkProductToOrders(cream.id)).toBe(0);
    await expectTrialBalance();
  });

  it("excluding an order removes it from the ledger; restoring puts it back", async () => {
    const { orderId } = await applyOrder(conn, pancake("delivered"));
    await prisma.order.update({ where: { id: orderId }, data: { excludedAt: new Date(), excludedReason: "test" } });
    await syncOrderEffects(prisma, orderId);
    expect((await balances())[A.SALES]).toBeUndefined();

    // An update from the channel must not resurrect it.
    await applyOrder(conn, pancake("delivered", { cod: 150000 }));
    expect((await balances())[A.SALES]).toBeUndefined();
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).excludedAt).not.toBeNull();

    await prisma.order.update({ where: { id: orderId }, data: { excludedAt: null, excludedReason: null } });
    await syncOrderEffects(prisma, orderId);
    expect((await balances())[A.SALES]).toBe(-150000);
    await expectTrialBalance();
  });

  it("another brand's product with the same SKU is never matched", async () => {
    const other = await prisma.brand.create({ data: { name: "Other", slug: "other" } });
    const c2 = await prisma.channelConnection.create({ data: { brandId: other.id, channel: "PANCAKE", label: "P2", webhookKey: "k2" } });
    const r = await applyOrder({ id: c2.id, brandId: other.id, channel: "PANCAKE" }, pancake("delivered"));
    expect(r.unmatchedSkus).toEqual(["SER-30"]);
    expect(await onHand(prisma, productId)).toBe(10);
    expect(await ledgerBalances({ brandId: other.id }, null)).toEqual({ [A.RECEIVABLE]: 139000, [A.SALES]: -149000, [A.SHIPPING]: 10000 });
  });

  it("a write-off shows up as an expense", async () => {
    await adjustStock({ productId, warehouseId, quantity: -2, note: "damaged" });
    expect(await onHand(prisma, productId)).toBe(8);
    const b = await balances();
    expect(b[A.INVENTORY]).toBe(240000);
    expect(b[A.INVENTORY_ADJUSTMENT]).toBe(60000);
  });

  it("a saved webhook delivery is applied, and a broken one is kept for retry", async () => {
    const good = await prisma.webhookEvent.create({
      data: { connectionId: conn.id, payload: JSON.stringify({ data: { id: 9, status_name: "delivered", cod: 50000, items: [] } }) },
    });
    expect((await processEvent(good.id)).status).toBe("APPLIED");
    expect(await prisma.order.count()).toBe(1);

    const ping = await prisma.webhookEvent.create({ data: { connectionId: conn.id, payload: JSON.stringify({ ping: true }) } });
    expect((await processEvent(ping.id)).status).toBe("IGNORED");

    const junk = await prisma.webhookEvent.create({ data: { connectionId: conn.id, payload: "<html>" } });
    expect((await processEvent(junk.id)).status).toBe("IGNORED");
    expect(await prisma.order.count()).toBe(1);
  });
});
