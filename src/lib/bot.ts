import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sha256Hex } from "@/lib/crypto";
import { customRange, isRangeKey, resolveRange, type Period } from "@/lib/period";

// The bot API is read-only. A key is sent as `Authorization: Bearer <key>` and
// may be limited to one brand; a brand-limited key can never read another.

export interface BotContext {
  /** The brand this request is about; null = all brands (only for unrestricted keys). */
  brandId: string | null;
  brandName: string;
}

export const botError = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

/** Pesos as a plain number with centavos, which is what a bot can read aloud. */
export const pesos = (centavos: number) => Math.round(centavos) / 100;

export async function authenticateBot(req: NextRequest): Promise<BotContext | NextResponse> {
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!given) return botError(401, "Missing API key. Send it as: Authorization: Bearer <key>");
  const key = await prisma.apiKey.findUnique({ where: { keyHash: sha256Hex(given) } });
  if (!key || key.revokedAt) return botError(401, "Invalid or revoked API key.");
  prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  const slug = req.nextUrl.searchParams.get("brand")?.trim().toLowerCase();
  if (!slug || slug === "all") {
    if (key.brandId) {
      const own = await prisma.brand.findUnique({ where: { id: key.brandId } });
      return { brandId: key.brandId, brandName: own?.name ?? "" };
    }
    return { brandId: null, brandName: "All brands" };
  }
  const brand = await prisma.brand.findUnique({ where: { slug } });
  if (!brand) return botError(404, `No brand with code "${slug}".`);
  if (key.brandId && key.brandId !== brand.id) return botError(403, "This key cannot read that brand.");
  return { brandId: brand.id, brandName: brand.name };
}

/** ?range=today|yesterday|7d|30d|mtd, or ?from=YYYY-MM-DD&to=YYYY-MM-DD. Defaults to today. */
export function periodFromQuery(req: NextRequest): { period: Period; label: string } | NextResponse {
  const q = req.nextUrl.searchParams;
  const from = q.get("from");
  const to = q.get("to");
  if (from || to) {
    const p = customRange(from ?? "", to ?? from ?? "");
    if (!p) return botError(400, "from/to must be YYYY-MM-DD, with to on or after from.");
    return { period: p, label: `${from} to ${to ?? from}` };
  }
  const range = q.get("range") ?? "today";
  if (!isRangeKey(range)) return botError(400, "range must be one of: today, yesterday, 7d, 30d, mtd.");
  return { period: resolveRange(range), label: range };
}
