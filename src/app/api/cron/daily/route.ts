import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeEqual } from "@/lib/crypto";
import { retryPendingEvents } from "@/lib/channels/process";
import { syncConnection } from "@/lib/channels/sync";

/**
 * The nightly safety net (see vercel.json): retry webhook deliveries that were
 * saved but not applied, then re-pull the last few days from every channel that
 * has API credentials, in case a delivery never arrived at all.
 *
 * Vercel calls this with `Authorization: Bearer $CRON_SECRET`.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!safeEqual(process.env.CRON_SECRET, given)) return new NextResponse(null, { status: 401 });

  const deadline = Date.now() + 240_000;
  const retried = await retryPendingEvents(200);

  const connections = await prisma.channelConnection.findMany({
    where: { apiSecret: { not: null }, brand: { active: true } },
    select: { id: true },
  });
  const synced = [];
  for (const c of connections) {
    if (Date.now() > deadline) break;
    synced.push(await syncConnection(c.id, { days: 3, deadline }));
  }
  return NextResponse.json({ ok: true, retried, synced });
}
