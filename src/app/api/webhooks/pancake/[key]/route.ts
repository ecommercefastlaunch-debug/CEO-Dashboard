import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret, safeEqual } from "@/lib/crypto";
import { processEvent } from "@/lib/channels/process";

/**
 * Pancake POS pushes an order here whenever it changes. (Webcake landing pages
 * submit into Pancake POS, so their orders arrive through this too.)
 *
 * Two secrets are required: the key in the URL, and a header secret Pancake is
 * configured to send. Every outcome answers 200 — a prober learns nothing, and
 * Pancake never emails the brand about a failure they cannot fix.
 *
 * The delivery is written to the database before anything else happens to it.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ok = (body: Record<string, unknown> = { ok: true }) => NextResponse.json(body, { status: 200 });

export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return ok();
  }

  const conn = key ? await prisma.channelConnection.findUnique({ where: { webhookKey: key } }) : null;
  if (!conn || conn.channel !== "PANCAKE") return ok();

  if (conn.webhookSecret) {
    const given = (req.headers.get("x-webhook-secret") ?? req.headers.get("authorization"))?.replace(/^Bearer\s+/i, "");
    let expected: string | null = null;
    try {
      expected = decryptSecret(conn.webhookSecret);
    } catch {
      expected = null;
    }
    if (!safeEqual(expected, given)) {
      await prisma.webhookEvent.create({
        data: { connectionId: conn.id, payload: raw.slice(0, 4000), status: "REJECTED", note: "Header secret missing or wrong.", processedAt: new Date() },
      });
      return ok();
    }
  }

  const event = await prisma.webhookEvent.create({ data: { connectionId: conn.id, payload: raw } });
  const result = await processEvent(event.id);
  return ok({ ok: true, status: result.status });
}
