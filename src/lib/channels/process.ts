// Turning a saved webhook delivery into orders. The delivery is already safely
// in the database by the time this runs, so a failure here loses nothing: the
// row is marked ERROR and the retry job picks it up again.

import { prisma } from "@/lib/prisma";
import { applyOrder, type ConnectionRef } from "@/lib/orders/apply";
import type { CanonicalOrder } from "@/lib/orders/types";
import { extractPancakeOrders, mapPancakeOrder } from "./pancake";
import { looksLikeShopifyOrder, mapShopifyOrder } from "./shopify";
import type { Raw } from "./util";

export const MAX_ATTEMPTS = 5;

/** Channel payload → canonical orders. Empty when the body holds no order. */
export function ordersFromPayload(channel: "PANCAKE" | "SHOPIFY", body: unknown): CanonicalOrder[] {
  const out: CanonicalOrder[] = [];
  if (channel === "PANCAKE") {
    for (const raw of extractPancakeOrders(body)) {
      const m = mapPancakeOrder(raw);
      if (m) out.push(m);
    }
  } else if (body && typeof body === "object" && !Array.isArray(body) && looksLikeShopifyOrder(body as Raw)) {
    const m = mapShopifyOrder(body as Raw);
    if (m) out.push(m);
  }
  return out;
}

export async function applyOrders(conn: ConnectionRef, orders: CanonicalOrder[]) {
  let applied = 0;
  const unrecognized = new Set<string>();
  for (const o of orders) {
    await applyOrder(conn, o);
    applied++;
    if (!o.statusRecognized && o.rawStatus) unrecognized.add(o.rawStatus);
  }
  return { applied, unrecognized: [...unrecognized] };
}

export async function processEvent(eventId: string): Promise<{ status: string; note: string }> {
  const event = await prisma.webhookEvent.findUnique({ where: { id: eventId }, include: { connection: true } });
  if (!event) return { status: "ERROR", note: "Event not found." };

  const finish = async (status: string, note: string) => {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status, note: note.slice(0, 500), processedAt: new Date(), attempts: { increment: 1 } },
    });
    return { status, note };
  };

  let body: unknown;
  try {
    body = JSON.parse(event.payload);
  } catch {
    return finish("IGNORED", "Body was not JSON.");
  }

  try {
    const orders = ordersFromPayload(event.connection.channel, body);
    if (!orders.length) return await finish("IGNORED", "No order found in payload.");
    const { applied, unrecognized } = await applyOrders(event.connection, orders);
    await prisma.channelConnection.update({ where: { id: event.connectionId }, data: { lastEventAt: new Date(), lastError: null } });
    const warn = unrecognized.length ? ` Unrecognised status treated as NEW: ${unrecognized.join(", ")}.` : "";
    return await finish("APPLIED", `${applied} order(s).${warn}`);
  } catch (e) {
    const message = (e as Error).message ?? String(e);
    await prisma.channelConnection
      .update({ where: { id: event.connectionId }, data: { lastError: message.slice(0, 300) } })
      .catch(() => {});
    return finish("ERROR", message);
  }
}

/** Retry deliveries that were saved but not applied. Run by the cron. */
export async function retryPendingEvents(limit = 50) {
  const events = await prisma.webhookEvent.findMany({
    where: { status: { in: ["PENDING", "ERROR"] }, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { receivedAt: "asc" },
    take: limit,
    select: { id: true },
  });
  const tally: Record<string, number> = {};
  for (const e of events) {
    const r = await processEvent(e.id);
    tally[r.status] = (tally[r.status] ?? 0) + 1;
  }
  return { tried: events.length, tally };
}
