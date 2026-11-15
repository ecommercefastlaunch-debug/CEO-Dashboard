// Pancake POS → canonical order. Webcake landing pages submit into Pancake POS,
// so this one mapper covers both.
//
// Pancake publishes no webhook payload specification, so everything here is
// deliberately tolerant: an order is looked for in several plausible places,
// and a field that is missing becomes null/0 rather than an exception.

import type { CanonicalItem, CanonicalOrder, CanonicalStatus } from "@/lib/orders/types";
import { arr, date, num, obj, str, type Raw } from "./util";

/**
 * Pancake reports PHP amounts already multiplied by 100 (₱1,490 → 149000), so
 * they are centavos as they arrive. Observed on a live PH shop in the B.E.X
 * app this mapper was ported from. If a shop ever reports whole pesos, this is
 * the one number to change.
 */
const AMOUNT_TO_CENTAVOS = 1;
const money = (v: unknown) => Math.round(num(v) * AMOUNT_TO_CENTAVOS);

// status_name → canonical. Codes seen on a live shop:
// 2 shipped · 3 delivered · 4 returning · 5 returned · 6 canceled · 9 pending.
const STATUS_NAME: Record<string, CanonicalStatus> = {
  delivered: "DELIVERED", received: "DELIVERED", completed: "DELIVERED", succeed: "DELIVERED", success: "DELIVERED",
  canceled: "CANCELLED", cancelled: "CANCELLED", removed: "CANCELLED", deleted: "CANCELLED",
  returned: "RETURNED",
  returning: "RETURNING", refunding: "RETURNING",
  shipped: "SHIPPED", sending: "SHIPPED", "sent to partner": "SHIPPED",
  confirmed: "CONFIRMED", packaging: "CONFIRMED", restocking: "CONFIRMED",
  new: "NEW", pending: "NEW", waiting: "NEW", draft: "NEW", submitted: "NEW", abandoned: "NEW",
};
const STATUS_CODE: Record<number, CanonicalStatus> = {
  2: "SHIPPED", 3: "DELIVERED", 4: "RETURNING", 5: "RETURNED", 6: "CANCELLED", 9: "NEW",
};

/**
 * Pull the order objects out of whatever arrived. Shapes tried, in order:
 * the order itself · { data } · { order } · { orders } · a bare array.
 */
export function extractPancakeOrders(body: unknown): Raw[] {
  if (!body || typeof body !== "object") return [];
  const seen: Raw[] = [];
  const consider = (v: unknown) => {
    if (Array.isArray(v)) for (const x of v) consider(x);
    else if (v && typeof v === "object" && looksLikeOrder(v as Raw)) seen.push(v as Raw);
  };
  if (Array.isArray(body)) {
    consider(body);
    return seen;
  }
  const b = body as Raw;
  consider(b);
  if (!seen.length) consider(b.data);
  if (!seen.length) consider(b.order);
  if (!seen.length) consider(b.orders);
  return seen;
}

/**
 * An order rather than a ping, an ack or a customer record. Strict on purpose:
 * a false positive would write a row of zeroes into the order book.
 */
export function looksLikeOrder(o: Raw): boolean {
  if (o.id == null && o.system_id == null) return false;
  const FIELDS = ["status", "status_name", "cod", "total_price", "items", "bill_phone_number", "shipping_address", "inserted_at", "customer"];
  return FIELDS.some((k) => o[k] !== undefined);
}

export function mapPancakeOrder(o: Raw): CanonicalOrder | null {
  const externalId = str(o.id ?? o.system_id);
  if (!externalId) return null;

  const statusName = String(o.status_name ?? "").toLowerCase().trim();
  const mapped = STATUS_NAME[statusName] ?? STATUS_CODE[num(o.status)];

  const items: CanonicalItem[] = arr(o.items).map((it) => {
    const vi = obj(it.variation_info);
    return {
      sku: str(vi.display_id ?? vi.barcode ?? it.variation_id),
      name: str(vi.name ?? it.name),
      quantity: Math.max(1, Math.round(num(it.quantity) || 1)),
      unitPriceCentavos: money(vi.retail_price ?? it.retail_price),
    };
  });

  const customer = obj(o.customer);
  const shipping = obj(o.shipping_address);
  const phones = Array.isArray(customer.phone_numbers) ? customer.phone_numbers : [];
  const partner = obj(o.partner);

  return {
    externalId,
    displayId: externalId,
    status: mapped ?? "NEW",
    rawStatus: str(o.status_name) ?? str(o.status),
    statusRecognized: mapped !== undefined,
    placedAt: date(o.inserted_at) ?? new Date(),
    updatedAt: date(o.updated_at),
    totalCentavos: money(o.cod ?? o.total_price),
    shippingCentavos: money(o.shipping_fee),
    discountCentavos: money(o.total_discount),
    courierFeeCentavos: money(o.partner_fee ?? partner.total_fee),
    isCod: true,
    isAbandonedCart: Boolean(o.is_webcake_abandoned_cart ?? o.is_abandoned_order ?? false),
    customerName: str(customer.name) ?? str(shipping.full_name) ?? str(shipping.name),
    phone: str(o.bill_phone_number) ?? str(shipping.phone_number) ?? (phones.length ? str(phones[0]) : null),
    province: str(shipping.province_name),
    courier: str(partner.partner_name),
    returnReason: str(o.returned_reason_name),
    landingLink: str(o.link),
    utmSource: str(o.p_utm_source),
    utmMedium: str(o.p_utm_medium),
    utmCampaign: str(o.p_utm_campaign),
    utmContent: str(o.p_utm_content),
    items,
  };
}

// ── API (backfill) ──────────────────────────────────────────────────────────

const BASE = "https://pos.pages.fm/api/v1";

export interface PancakePage {
  ok: boolean;
  status: number;
  orders: Raw[];
  totalPages: number;
  error: string | null;
}

/**
 * One page of a shop's orders, newest-updated first where Pancake allows it.
 *
 * SECURITY: Pancake only accepts the key as a query parameter, so the URL holds
 * the secret. It is never logged and never returned — errors carry the status
 * and a body preview only.
 */
export async function fetchPancakeOrders(
  shopId: string,
  apiKey: string,
  opts: { page: number; pageSize?: number; sinceUnix?: number; untilUnix?: number },
): Promise<PancakePage> {
  const q = new URLSearchParams({ api_key: apiKey, page_number: String(opts.page), page_size: String(opts.pageSize ?? 100) });
  if (opts.sinceUnix) q.set("startDateTime", String(opts.sinceUnix));
  if (opts.untilUnix) q.set("endDateTime", String(opts.untilUnix));
  if (opts.sinceUnix) q.set("updateStatus", "updated_at");

  let res: Response;
  try {
    res = await fetch(`${BASE}/shops/${encodeURIComponent(shopId)}/orders?${q}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, status: 0, orders: [], totalPages: 0, error: `Network error: ${(e as Error).message}` };
  }
  const text = await res.text();
  let json: Raw | null = null;
  try {
    json = JSON.parse(text) as Raw;
  } catch {
    /* handled below */
  }
  if (!res.ok || !json) {
    return { ok: false, status: res.status, orders: [], totalPages: 0, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
  }
  return { ok: true, status: res.status, orders: arr(json.data), totalPages: Number(json.total_pages ?? 1) || 1, error: null };
}
