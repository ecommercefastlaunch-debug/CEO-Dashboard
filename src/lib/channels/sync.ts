// Backfill: ask the channel's API for everything that changed recently and
// apply it through the same path as a webhook. This is the safety net for
// deliveries that never arrived, and how history is loaded on day one.

import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import type { CanonicalOrder } from "@/lib/orders/types";
import { applyOrders } from "./process";
import { fetchPancakeOrders, mapPancakeOrder } from "./pancake";
import { fetchShopifyOrders, mapShopifyOrder } from "./shopify";

const MAX_PAGES = 200;

export interface SyncOutcome {
  connectionId: string;
  ok: boolean;
  applied: number;
  note: string;
}

export async function syncConnection(connectionId: string, opts: { days: number; deadline?: number }): Promise<SyncOutcome> {
  const conn = await prisma.channelConnection.findUnique({ where: { id: connectionId } });
  if (!conn) return { connectionId, ok: false, applied: 0, note: "Connection not found." };
  if (!conn.apiSecret || !conn.externalShopId) {
    return { connectionId, ok: false, applied: 0, note: "No API credentials saved — webhooks only." };
  }

  const since = new Date(Date.now() - opts.days * 24 * 60 * 60 * 1000);
  const outOfTime = () => opts.deadline !== undefined && Date.now() > opts.deadline;
  let applied = 0;
  let note = "";
  let ok = true;

  try {
    const secret = decryptSecret(conn.apiSecret);
    if (conn.channel === "PANCAKE") {
      let totalPages = 1;
      for (let page = 1; page <= Math.min(totalPages, MAX_PAGES); page++) {
        if (outOfTime()) {
          note = `Stopped at page ${page} of ${totalPages} — out of time; the next run continues.`;
          break;
        }
        const r = await fetchPancakeOrders(conn.externalShopId, secret, {
          page,
          sinceUnix: Math.floor(since.getTime() / 1000),
          untilUnix: Math.floor(Date.now() / 1000),
        });
        if (!r.ok) throw new Error(r.error ?? "Pancake API error.");
        totalPages = r.totalPages;
        const orders = r.orders.map(mapPancakeOrder).filter((o): o is CanonicalOrder => o !== null);
        applied += (await applyOrders(conn, orders)).applied;
        if (!r.orders.length) break;
      }
    } else {
      let pageInfo: string | null = null;
      for (let page = 1; page <= MAX_PAGES; page++) {
        if (outOfTime()) {
          note = "Stopped early — out of time; the next run continues.";
          break;
        }
        const r = await fetchShopifyOrders(conn.externalShopId, secret, { since, pageInfo });
        if (!r.ok) throw new Error(r.error ?? "Shopify API error.");
        const orders = r.orders.map(mapShopifyOrder).filter((o): o is CanonicalOrder => o !== null);
        applied += (await applyOrders(conn, orders)).applied;
        pageInfo = r.nextPageInfo;
        if (!pageInfo) break;
      }
    }
  } catch (e) {
    ok = false;
    note = ((e as Error).message ?? String(e)).slice(0, 300);
  }

  await prisma.channelConnection.update({
    where: { id: conn.id },
    data: ok ? { lastSyncAt: new Date(), lastError: null } : { lastError: note },
  });
  return { connectionId, ok, applied, note: note || `${applied} order(s) checked.` };
}
