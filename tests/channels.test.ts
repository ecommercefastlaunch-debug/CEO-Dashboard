import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { extractPancakeOrders, mapPancakeOrder } from "@/lib/channels/pancake";
import { mapShopifyOrder, shopifyStatus, verifyShopifyHmac } from "@/lib/channels/shopify";
import { ordersFromPayload } from "@/lib/channels/process";

const pancakeOrder = {
  id: 4307,
  status: 3,
  status_name: "delivered",
  inserted_at: "2026-11-10T02:15:00Z",
  updated_at: "2026-11-13T09:00:00Z",
  cod: 149000,
  shipping_fee: 0,
  partner_fee: 10000,
  partner: { partner_name: "J&T Express" },
  bill_phone_number: "09171234567",
  shipping_address: { full_name: "Maria Santos", province_name: "Cebu" },
  link: "https://shop.example/lp?utm_source=facebook",
  p_utm_source: "facebook",
  p_utm_campaign: "1203",
  items: [
    { quantity: 2, variation_info: { name: "Serum 30ml", display_id: "SER-30", retail_price: 74500 } },
    { quantity: 1, variation_info: { name: "Free gift", barcode: "GIFT-1", retail_price: 0 } },
  ],
};

describe("Pancake", () => {
  it("finds orders in every shape the feed has been seen in", () => {
    expect(extractPancakeOrders(pancakeOrder)).toHaveLength(1);
    expect(extractPancakeOrders({ data: pancakeOrder })).toHaveLength(1);
    expect(extractPancakeOrders({ data: [pancakeOrder, pancakeOrder] })).toHaveLength(2);
    expect(extractPancakeOrders({ order: pancakeOrder })).toHaveLength(1);
    expect(extractPancakeOrders({ orders: [pancakeOrder] })).toHaveLength(1);
    expect(extractPancakeOrders([pancakeOrder])).toHaveLength(1);
  });

  it("does not mistake a ping or a customer for an order", () => {
    expect(extractPancakeOrders({ ok: true })).toEqual([]);
    expect(extractPancakeOrders({ id: 5, name: "Maria" })).toEqual([]);
    expect(extractPancakeOrders("hello")).toEqual([]);
    expect(extractPancakeOrders(null)).toEqual([]);
  });

  it("maps an order", () => {
    const o = mapPancakeOrder(pancakeOrder)!;
    expect(o).toMatchObject({
      externalId: "4307",
      status: "DELIVERED",
      statusRecognized: true,
      totalCentavos: 149000,
      courierFeeCentavos: 10000,
      isCod: true,
      customerName: "Maria Santos",
      phone: "09171234567",
      province: "Cebu",
      courier: "J&T Express",
      utmSource: "facebook",
      utmCampaign: "1203",
    });
    expect(o.placedAt.toISOString()).toBe("2026-11-10T02:15:00.000Z");
    expect(o.items).toEqual([
      { sku: "SER-30", name: "Serum 30ml", quantity: 2, unitPriceCentavos: 74500 },
      { sku: "GIFT-1", name: "Free gift", quantity: 1, unitPriceCentavos: 0 },
    ]);
  });

  it("falls back to the numeric code, and flags a status it has never seen", () => {
    expect(mapPancakeOrder({ id: 1, status: 5, items: [] })!.status).toBe("RETURNED");
    const unknown = mapPancakeOrder({ id: 1, status: 77, status_name: "teleported", items: [] })!;
    expect(unknown.status).toBe("NEW");
    expect(unknown.statusRecognized).toBe(false);
  });

  it("survives an order with almost nothing in it", () => {
    const o = mapPancakeOrder({ id: "x1", status_name: "new" })!;
    expect(o.items).toEqual([]);
    expect(o.totalCentavos).toBe(0);
    expect(o.customerName).toBeNull();
  });
});

const shopifyOrder = {
  id: 5550001,
  name: "#1042",
  created_at: "2026-11-11T10:00:00+08:00",
  updated_at: "2026-11-12T10:00:00+08:00",
  financial_status: "paid",
  fulfillment_status: null,
  current_total_price: "1490.00",
  total_discounts: "100.00",
  total_shipping_price_set: { shop_money: { amount: "90.00" } },
  payment_gateway_names: ["paymongo"],
  landing_site: "/products/serum?utm_source=tiktok&utm_campaign=bf",
  shipping_address: { name: "Juan Cruz", phone: "+639181112222", province: "Metro Manila" },
  line_items: [{ sku: "SER-30", title: "Serum", variant_title: "30ml", quantity: 2, price: "700.00" }],
  fulfillments: [],
};

describe("Shopify", () => {
  it("verifies the signature over the raw body", () => {
    const body = JSON.stringify(shopifyOrder);
    const good = crypto.createHmac("sha256", "shpss_secret").update(body).digest("base64");
    expect(verifyShopifyHmac(body, "shpss_secret", good)).toBe(true);
    expect(verifyShopifyHmac(body + " ", "shpss_secret", good)).toBe(false);
    expect(verifyShopifyHmac(body, "other", good)).toBe(false);
    expect(verifyShopifyHmac(body, "shpss_secret", null)).toBe(false);
    expect(verifyShopifyHmac(body, "shpss_secret", "not-base64-of-right-length")).toBe(false);
  });

  it("collapses Shopify's three status fields into one", () => {
    expect(shopifyStatus({ ...shopifyOrder, financial_status: "pending" })).toBe("NEW");
    expect(shopifyStatus(shopifyOrder)).toBe("CONFIRMED");
    expect(shopifyStatus({ ...shopifyOrder, fulfillment_status: "fulfilled" })).toBe("DELIVERED");
    expect(shopifyStatus({ ...shopifyOrder, financial_status: "pending", fulfillment_status: "fulfilled" })).toBe("SHIPPED");
    expect(
      shopifyStatus({ ...shopifyOrder, financial_status: "pending", fulfillment_status: "fulfilled", fulfillments: [{ shipment_status: "delivered" }] }),
    ).toBe("DELIVERED");
    expect(shopifyStatus({ ...shopifyOrder, cancelled_at: "2026-11-12T00:00:00Z" })).toBe("CANCELLED");
    expect(shopifyStatus({ ...shopifyOrder, financial_status: "refunded" })).toBe("CANCELLED");
    expect(shopifyStatus({ ...shopifyOrder, financial_status: "refunded", fulfillment_status: "fulfilled" })).toBe("RETURNED");
  });

  it("maps an order, converting decimal pesos to centavos", () => {
    const o = mapShopifyOrder(shopifyOrder)!;
    expect(o).toMatchObject({
      externalId: "5550001",
      displayId: "#1042",
      status: "CONFIRMED",
      totalCentavos: 149000,
      shippingCentavos: 9000,
      discountCentavos: 10000,
      isCod: false,
      customerName: "Juan Cruz",
      province: "Metro Manila",
      utmSource: "tiktok",
      utmCampaign: "bf",
    });
    expect(o.items).toEqual([{ sku: "SER-30", name: "Serum — 30ml", quantity: 2, unitPriceCentavos: 70000 }]);
  });

  it("recognises cash on delivery", () => {
    expect(mapShopifyOrder({ ...shopifyOrder, payment_gateway_names: ["Cash on Delivery (COD)"] })!.isCod).toBe(true);
  });
});

describe("payload routing", () => {
  it("reads each channel's payload with its own mapper", () => {
    expect(ordersFromPayload("PANCAKE", { data: pancakeOrder })).toHaveLength(1);
    expect(ordersFromPayload("SHOPIFY", shopifyOrder)).toHaveLength(1);
    expect(ordersFromPayload("SHOPIFY", { id: 1, email: "a@b.c" })).toEqual([]);
    expect(ordersFromPayload("PANCAKE", { ping: true })).toEqual([]);
  });
});
