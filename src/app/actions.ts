"use server";

// Every write a person can make from a screen. Server actions are public
// endpoints, so each one checks the caller's role before doing anything.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createSessionToken, FLASH_KEY_COOKIE, roleForPassword, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth";
import { requireRole } from "@/lib/session";
import { encryptSecret, newToken, sha256Hex } from "@/lib/crypto";
import { parsePeso } from "@/lib/money";
import { A, EXPENSE_ACCOUNTS } from "@/lib/accounting/accounts";
import { postEntry } from "@/lib/accounting/ledger";
import { transfer } from "@/lib/accounting/postings";
import { adjustStock, receiveStock, transferStock } from "@/lib/inventory/stock";
import { linkProductToOrders, syncOrderEffects } from "@/lib/orders/apply";
import { syncConnection } from "@/lib/channels/sync";
import { phStartOfDay } from "@/lib/period";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Go back to the page the form was on, carrying a one-line result. */
function back(f: FormData, fallback: string, result: { ok?: string; error?: string }): never {
  const raw = text(f, "back");
  const target = raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
  const url = new URL(target, "http://x");
  url.searchParams.delete("ok");
  url.searchParams.delete("error");
  if (result.ok) url.searchParams.set("ok", result.ok);
  if (result.error) url.searchParams.set("error", result.error);
  revalidatePath("/", "layout");
  redirect(url.pathname + url.search);
}

/** Run a write; turn any thrown message into the banner instead of a crash page. */
async function attempt(f: FormData, fallback: string, work: () => Promise<string>): Promise<never> {
  let result: { ok?: string; error?: string };
  try {
    result = { ok: await work() };
  } catch (e) {
    const message = (e as Error)?.message ?? "Something went wrong.";
    // Prisma's unique-constraint error is not something a person should read.
    result = { error: /Unique constraint/i.test(message) ? "That already exists." : message.split("\n").pop()!.slice(0, 200) };
  }
  return back(f, fallback, result);
}

// ── Sign-in ─────────────────────────────────────────────────────────────────

export async function login(f: FormData) {
  const role = roleForPassword(text(f, "password"));
  if (!role) redirect("/login?error=Wrong+password.");
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(role), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  redirect(role === "owner" ? "/" : "/warehouse");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ── Brands, warehouses, channels ────────────────────────────────────────────

export async function createBrand(f: FormData) {
  await requireRole("owner");
  return attempt(f, "/settings", async () => {
    const name = text(f, "name");
    if (!name) throw new Error("Give the brand a name.");
    const slug = (text(f, "slug") || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug) throw new Error("The brand code needs letters or numbers.");
    await prisma.brand.create({ data: { name, slug } });
    return `Brand "${name}" added.`;
  });
}

export async function createWarehouse(f: FormData) {
  await requireRole("owner");
  return attempt(f, "/settings", async () => {
    const name = text(f, "name");
    if (!name) throw new Error("Give the warehouse a name.");
    const first = (await prisma.warehouse.count()) === 0;
    await prisma.warehouse.create({ data: { name, isDefault: first } });
    return `Warehouse "${name}" added.`;
  });
}

export async function setDefaultWarehouse(f: FormData) {
  await requireRole("owner");
  return attempt(f, "/settings", async () => {
    const id = text(f, "warehouseId");
    await prisma.$transaction([
      prisma.warehouse.updateMany({ data: { isDefault: false } }),
      prisma.warehouse.update({ where: { id }, data: { isDefault: true } }),
    ]);
    return "Orders now ship from that warehouse.";
  });
}

export async function createConnection(f: FormData) {
  await requireRole("owner");
  return attempt(f, "/settings", async () => {
    const brandId = text(f, "brandId");
    const channel = text(f, "channel");
    if (channel !== "PANCAKE" && channel !== "SHOPIFY") throw new Error("Pick Pancake or Shopify.");
    const shopId = text(f, "externalShopId") || null;
    const apiSecret = text(f, "apiSecret") || null;
    const signingSecret = text(f, "signingSecret");
    if (channel === "SHOPIFY" && !signingSecret) throw new Error("Shopify needs the app's API secret key to verify webhooks.");
    const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } });
    await prisma.channelConnection.create({
      data: {
        brandId,
        channel,
        label: text(f, "label") || `${brand.name} — ${channel === "PANCAKE" ? "Pancake" : "Shopify"}`,
        webhookKey: newToken(),
        // Pancake: a secret we invent and the operator pastes into Pancake.
        // Shopify: the secret Shopify itself signs with.
        webhookSecret: encryptSecret(channel === "PANCAKE" ? newToken() : signingSecret),
        externalShopId: shopId,
        apiSecret: apiSecret ? encryptSecret(apiSecret) : null,
      },
    });
    return "Connection added. Copy its webhook address below into the channel.";
  });
}

export async function deleteConnection(f: FormData) {
  await requireRole("owner");
  return attempt(f, "/settings", async () => {
    const id = text(f, "connectionId");
    const orders = await prisma.order.count({ where: { connectionId: id } });
    if (orders > 0) throw new Error(`This connection has ${orders} orders. It can't be removed without deleting them.`);
    await prisma.channelConnection.delete({ where: { id } });
    return "Connection removed.";
  });
}

export async function syncNow(f: FormData) {
  await requireRole("owner");
  return attempt(f, "/settings", async () => {
    const days = Math.min(90, Math.max(1, Number(text(f, "days")) || 7));
    const r = await syncConnection(text(f, "connectionId"), { days, deadline: Date.now() + 45_000 });
    if (!r.ok) throw new Error(r.note);
    return `Synced the last ${days} days: ${r.note}`;
  });
}

// ── Bot keys ────────────────────────────────────────────────────────────────

export async function createApiKey(f: FormData) {
  await requireRole("owner");
  const name = text(f, "name");
  if (!name) return back(f, "/settings", { error: "Name the bot this key is for." });
  const key = `erp_${newToken(30)}`;
  await prisma.apiKey.create({
    data: { name, keyHash: sha256Hex(key), prefix: key.slice(0, 10), brandId: text(f, "brandId") || null },
  });
  // Shown once, then gone: only its hash is stored.
  (await cookies()).set(FLASH_KEY_COOKIE, key, { httpOnly: true, sameSite: "strict", path: "/settings", maxAge: 120 });
  return back(f, "/settings", { ok: "Key created. Copy it now — it is shown only once." });
}

export async function revokeApiKey(f: FormData) {
  await requireRole("owner");
  return attempt(f, "/settings", async () => {
    await prisma.apiKey.update({ where: { id: text(f, "keyId") }, data: { revokedAt: new Date() } });
    return "Key revoked.";
  });
}

// ── Warehouse ───────────────────────────────────────────────────────────────

export async function createProduct(f: FormData) {
  await requireRole("owner");
  return attempt(f, "/warehouse", async () => {
    const sku = text(f, "sku");
    const name = text(f, "name");
    if (!sku || !name) throw new Error("A product needs a SKU and a name.");
    const cost = text(f, "unitCost") ? parsePeso(text(f, "unitCost")) : 0;
    if (cost == null || cost < 0) throw new Error("Unit cost isn't a valid amount.");
    const product = await prisma.product.create({
      data: { brandId: text(f, "brandId"), sku, name, unitCostCentavos: cost, reorderPoint: Math.max(0, Number(text(f, "reorderPoint")) || 0) },
    });
    const linked = await linkProductToOrders(product.id);
    return linked ? `Product added and matched to ${linked} earlier order(s).` : "Product added.";
  });
}

export async function updateProduct(f: FormData) {
  await requireRole("owner");
  return attempt(f, "/warehouse", async () => {
    const id = text(f, "productId");
    const cost = parsePeso(text(f, "unitCost"));
    if (cost == null || cost < 0) throw new Error("Unit cost isn't a valid amount.");
    await prisma.product.update({
      where: { id },
      data: { unitCostCentavos: cost, reorderPoint: Math.max(0, Number(text(f, "reorderPoint")) || 0), name: text(f, "name") || undefined },
    });
    // Orders that shipped while the cost was still unknown pick it up now.
    await linkProductToOrders(id);
    return "Product updated.";
  });
}

export async function receiveStockAction(f: FormData) {
  const role = await requireRole("owner", "warehouse");
  return attempt(f, "/warehouse", async () => {
    const productId = text(f, "productId");
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    // Warehouse staff count boxes; they don't enter (or see) costs.
    const typed = role === "owner" && text(f, "unitCost") ? parsePeso(text(f, "unitCost")) : product.unitCostCentavos;
    if (typed == null) throw new Error("Unit cost isn't a valid amount.");
    const quantity = Number(text(f, "quantity"));
    await receiveStock({
      productId,
      warehouseId: text(f, "warehouseId"),
      quantity,
      unitCostCentavos: typed,
      paidInCash: role === "owner" && text(f, "payment") === "cash",
      note: text(f, "note"),
    });
    await linkProductToOrders(productId);
    return `Received ${quantity} × ${product.sku}.`;
  });
}

export async function adjustStockAction(f: FormData) {
  await requireRole("owner", "warehouse");
  return attempt(f, "/warehouse", async () => {
    const note = text(f, "note");
    if (!note) throw new Error("Say why the stock is being adjusted.");
    const quantity = Number(text(f, "quantity"));
    await adjustStock({ productId: text(f, "productId"), warehouseId: text(f, "warehouseId"), quantity, note });
    return `Stock adjusted by ${quantity > 0 ? "+" : ""}${quantity}.`;
  });
}

export async function transferStockAction(f: FormData) {
  await requireRole("owner", "warehouse");
  return attempt(f, "/warehouse", async () => {
    const quantity = Number(text(f, "quantity"));
    await transferStock({
      productId: text(f, "productId"),
      fromWarehouseId: text(f, "fromWarehouseId"),
      toWarehouseId: text(f, "toWarehouseId"),
      quantity,
      note: text(f, "note"),
    });
    return `Moved ${quantity} unit(s).`;
  });
}

// ── Orders ──────────────────────────────────────────────────────────────────

export async function setOrderExcluded(f: FormData) {
  await requireRole("owner");
  return attempt(f, "/orders", async () => {
    const id = text(f, "orderId");
    const exclude = text(f, "exclude") === "1";
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: exclude ? { excludedAt: new Date(), excludedReason: text(f, "reason") || "Excluded by owner" } : { excludedAt: null, excludedReason: null },
      });
      await syncOrderEffects(tx, id);
    });
    return exclude ? "Order excluded from every number." : "Order restored.";
  });
}

// ── Accounting ──────────────────────────────────────────────────────────────

/**
 * The money events that don't come from an order: each is one plain sentence
 * on the screen and one balanced entry here. Nobody types debits or credits.
 */
const KINDS: Record<string, { debit: string; credit: string; label: string }> = {
  ad_spend: { debit: A.ADVERTISING, credit: A.CASH, label: "Ad spend" },
  remittance: { debit: A.CASH, credit: A.RECEIVABLE, label: "Courier / gateway remittance" },
  supplier_payment: { debit: A.PAYABLE, credit: A.CASH, label: "Paid supplier" },
  owner_in: { debit: A.CASH, credit: A.EQUITY, label: "Owner put money in" },
  owner_out: { debit: A.EQUITY, credit: A.CASH, label: "Owner took money out" },
};

export async function recordTransaction(f: FormData) {
  await requireRole("owner");
  return attempt(f, "/accounting", async () => {
    const kind = text(f, "kind");
    const amount = parsePeso(text(f, "amount"));
    if (amount == null || amount <= 0) throw new Error("Enter an amount above zero.");
    const day = text(f, "date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Pick a date.");

    let debit: string;
    let credit: string;
    let label: string;
    if (kind.startsWith("expense:")) {
      const acct = EXPENSE_ACCOUNTS.find((a) => a.code === kind.slice(8));
      if (!acct) throw new Error("Pick what the payment was for.");
      ({ debit, credit, label } = { debit: acct.code, credit: A.CASH, label: acct.name });
    } else if (KINDS[kind]) {
      ({ debit, credit, label } = KINDS[kind]);
    } else {
      throw new Error("Pick what kind of transaction this is.");
    }

    const note = text(f, "note");
    await postEntry(prisma, {
      brandId: text(f, "brandId"),
      // Noon Manila time, so the entry sits safely inside its day.
      date: new Date(phStartOfDay(day).getTime() + 12 * 60 * 60 * 1000),
      memo: note ? `${label} — ${note}` : label,
      sourceType: "MANUAL",
      lines: transfer(debit, credit, amount),
    });
    return `${label} recorded.`;
  });
}

export async function deleteManualEntry(f: FormData) {
  await requireRole("owner");
  return attempt(f, "/accounting", async () => {
    // Only hand-typed entries can be removed; order and stock entries are
    // corrected by correcting the order or the stock.
    const r = await prisma.journalEntry.deleteMany({ where: { id: text(f, "entryId"), sourceType: "MANUAL" } });
    if (!r.count) throw new Error("Only manually recorded transactions can be removed.");
    return "Transaction removed.";
  });
}
