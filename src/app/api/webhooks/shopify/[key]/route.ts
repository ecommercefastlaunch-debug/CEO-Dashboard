import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { verifyShopifyHmac } from "@/lib/channels/shopify";
import { processEvent } from "@/lib/channels/process";

/**
 * Shopify order webhooks (orders/create, orders/updated, orders/cancelled,
 * orders/fulfilled, orders/paid). Shopify signs the raw body with the app's
 * secret; an unsigned or wrongly signed delivery is refused with 401, which is
 * what Shopify expects — it retries, and disables the webhook only after many
 * failures.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const raw = await req.text();

  const conn = key ? await prisma.channelConnection.findUnique({ where: { webhookKey: key } }) : null;
  if (!conn || conn.channel !== "SHOPIFY" || !conn.webhookSecret) return new NextResponse(null, { status: 401 });

  let secret: string;
  try {
    secret = decryptSecret(conn.webhookSecret);
  } catch {
    return new NextResponse(null, { status: 401 });
  }
  if (!verifyShopifyHmac(raw, secret, req.headers.get("x-shopify-hmac-sha256"))) {
    return new NextResponse(null, { status: 401 });
  }

  const event = await prisma.webhookEvent.create({
    data: { connectionId: conn.id, topic: req.headers.get("x-shopify-topic"), payload: raw },
  });
  // Saved. From here on answer 200 whatever happens — a processing error is
  // ours to retry, not Shopify's.
  const result = await processEvent(event.id);
  return NextResponse.json({ ok: true, status: result.status });
}
