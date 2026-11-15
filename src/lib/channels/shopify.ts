// Shopify → canonical order.
//
// Shopify signs every webhook with the app's secret (HMAC-SHA256 of the raw
// body, base64, in X-Shopify-Hmac-Sha256). The payload is the REST order object.

import crypto from "node:crypto";
import type { CanonicalItem, CanonicalOrder, CanonicalStatus } from "@/lib/orders/types";
import { arr, date, num, obj, str, utmFromUrl, type Raw } from "./util";

/** Shopify sends decimal strings in the shop currency: "1490.00" → 149000. */
const money = (v: unknown) => Math.round(num(v) * 100);

export function verifyShopifyHmac(rawBody: string, secret: string, header: string | null): boolean {
  if (!header || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest();
  let given: Buffer;
  try {
    given = Buffer.from(header, "base64");
  } catch {
    return false;
  }
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export function looksLikeShopifyOrder(o: Raw): boolean {
  return o.id != null && (o.line_items !== undefined || o.financial_status !== undefined);
}

/**
 * Shopify has no single "status". This is how its three fields collapse:
 *
 *   cancelled_at set                          → CANCELLED
 *   refunded, and it had shipped              → RETURNED
 *   refunded, never shipped                   → CANCELLED
 *   fulfilled + carrier says delivered        → DELIVERED
 *   fulfilled + already paid (prepaid order)  → DELIVERED  (money is in; the sale is real)
 *   fulfilled + unpaid (COD still in transit) → SHIPPED
 *   paid / authorized, not yet fulfilled      → CONFIRMED
 *   otherwise                                 → NEW
 */
export function shopifyStatus(o: Raw): CanonicalStatus {
  const financial = String(o.financial_status ?? "").toLowerCase();
  const fulfillment = String(o.fulfillment_status ?? "").toLowerCase();
  const fulfillments = arr(o.fulfillments);
  const fulfilled = fulfillment === "fulfilled";
  const delivered = fulfillments.some((f) => String(f.shipment_status ?? "").toLowerCase() === "delivered");

  if (o.cancelled_at) return "CANCELLED";
  if (financial === "refunded") return fulfilled || fulfillments.length ? "RETURNED" : "CANCELLED";
  if (fulfilled && (delivered || financial === "paid")) return "DELIVERED";
  if (fulfilled || fulfillment === "partial") return "SHIPPED";
  if (financial === "paid" || financial === "authorized" || financial === "partially_paid") return "CONFIRMED";
  return "NEW";
}

export function mapShopifyOrder(o: Raw): CanonicalOrder | null {
  const externalId = str(o.id);
  if (!externalId) return null;

  const items: CanonicalItem[] = arr(o.line_items).map((li) => ({
    sku: str(li.sku),
    name: [str(li.title), str(li.variant_title)].filter(Boolean).join(" — ") || null,
    quantity: Math.max(1, Math.round(num(li.quantity) || 1)),
    unitPriceCentavos: money(li.price),
  }));

  const shipping = obj(o.shipping_address);
  const customer = obj(o.customer);
  const gateways = (Array.isArray(o.payment_gateway_names) ? o.payment_gateway_names : []).map((g) => String(g).toLowerCase());
  const isCod = gateways.some((g) => g.includes("cod") || g.includes("cash on delivery"));
  const shippingSet = obj(obj(o.total_shipping_price_set).shop_money);
  const landing = str(o.landing_site);
  const utm = utmFromUrl(landing);
  const fulfillments = arr(o.fulfillments);
  const customerName =
    str(shipping.name) ?? ([str(customer.first_name), str(customer.last_name)].filter(Boolean).join(" ") || null);

  return {
    externalId,
    displayId: str(o.name) ?? str(o.order_number),
    status: shopifyStatus(o),
    rawStatus: [str(o.financial_status), str(o.fulfillment_status) ?? "unfulfilled"].filter(Boolean).join(" / "),
    statusRecognized: true,
    placedAt: date(o.created_at) ?? new Date(),
    updatedAt: date(o.updated_at),
    totalCentavos: money(o.current_total_price ?? o.total_price),
    shippingCentavos: money(shippingSet.amount),
    discountCentavos: money(o.current_total_discounts ?? o.total_discounts),
    courierFeeCentavos: 0,
    isCod,
    isAbandonedCart: false,
    customerName,
    phone: str(shipping.phone) ?? str(o.phone) ?? str(customer.phone),
    province: str(shipping.province),
    courier: fulfillments.length ? str(fulfillments[fulfillments.length - 1].tracking_company) : null,
    returnReason: str(o.cancel_reason),
    landingLink: landing,
    utmSource: utm.source,
    utmMedium: utm.medium,
    utmCampaign: utm.campaign,
    utmContent: utm.content,
    items,
  };
}

// ── API (backfill) ──────────────────────────────────────────────────────────

const API_VERSION = "2025-10";

/** Orders updated since `since`, one page. `pageInfo` continues a prior page. */
export async function fetchShopifyOrders(
  shopDomain: string,
  accessToken: string,
  opts: { since: Date; pageInfo?: string | null },
): Promise<{ ok: boolean; orders: Raw[]; nextPageInfo: string | null; error: string | null }> {
  const host = shopDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const q = new URLSearchParams({ limit: "250" });
  if (opts.pageInfo) q.set("page_info", opts.pageInfo);
  else {
    q.set("status", "any");
    q.set("updated_at_min", opts.since.toISOString());
  }
  let res: Response;
  try {
    res = await fetch(`https://${host}/admin/api/${API_VERSION}/orders.json?${q}`, {
      headers: { "X-Shopify-Access-Token": accessToken, accept: "application/json" },
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, orders: [], nextPageInfo: null, error: `Network error: ${(e as Error).message}` };
  }
  const text = await res.text();
  if (!res.ok) return { ok: false, orders: [], nextPageInfo: null, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
  let json: Raw;
  try {
    json = JSON.parse(text) as Raw;
  } catch {
    return { ok: false, orders: [], nextPageInfo: null, error: "Shopify returned a body that was not JSON." };
  }
  const next = /<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/.exec(res.headers.get("link") ?? "");
  return { ok: true, orders: arr(json.orders), nextPageInfo: next ? decodeURIComponent(next[1]) : null, error: null };
}
