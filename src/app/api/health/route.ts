import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/health — is the app up, and can it reach the database?
 * Public on purpose (uptime monitors), so it says nothing beyond ok / not ok.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: "ok" });
  } catch (e) {
    // The detail goes to the server log, not to the public response.
    console.error("[health] database check failed:", (e as Error).message);
    return NextResponse.json({ ok: false, database: "unreachable" }, { status: 503 });
  }
}
