import { NextResponse, type NextRequest } from "next/server";
import { authenticateBot, pesos } from "@/lib/bot";
import { stockRows } from "@/lib/reports";

/** GET /api/bot/v1/stock?brand=<code|all>&sku=<optional, partial match>&low=1 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await authenticateBot(req);
  if (ctx instanceof NextResponse) return ctx;
  const q = req.nextUrl.searchParams;
  const sku = q.get("sku")?.trim().toLowerCase();
  const lowOnly = q.get("low") === "1" || q.get("low") === "true";

  let rows = await stockRows({ brandId: ctx.brandId });
  if (sku) rows = rows.filter((r) => r.sku.toLowerCase().includes(sku) || r.name.toLowerCase().includes(sku));
  if (lowOnly) rows = rows.filter((r) => r.low);

  return NextResponse.json({
    ok: true,
    brand: ctx.brandName,
    currency: "PHP",
    total_value: pesos(rows.reduce((s, r) => s + r.valueCentavos, 0)),
    products: rows.map((r) => ({
      brand: r.brandName,
      sku: r.sku,
      name: r.name,
      on_hand: r.onHand,
      unit_cost: pesos(r.unitCostCentavos),
      value: pesos(r.valueCentavos),
      reorder_point: r.reorderPoint,
      low: r.low,
    })),
  });
}
