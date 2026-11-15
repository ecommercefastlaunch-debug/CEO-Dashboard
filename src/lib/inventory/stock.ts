import { prisma, type Db } from "@/lib/prisma";
import { A } from "@/lib/accounting/accounts";
import { postEntry } from "@/lib/accounting/ledger";
import { transfer } from "@/lib/accounting/postings";
import { movingAverageCost } from "./rules";

/** The warehouse orders ship from. Created on first use so a fresh install works. */
export async function defaultWarehouse(db: Db) {
  const existing =
    (await db.warehouse.findFirst({ where: { isDefault: true, active: true } })) ??
    (await db.warehouse.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } }));
  if (existing) return existing;
  return db.warehouse.create({ data: { name: "Main warehouse", isDefault: true } });
}

/** Units on hand for one product, across warehouses or in one. */
export async function onHand(db: Db, productId: string, warehouseId?: string): Promise<number> {
  const agg = await db.stockMovement.aggregate({ where: { productId, warehouseId }, _sum: { quantity: true } });
  return agg._sum.quantity ?? 0;
}

/**
 * Stock arriving from a supplier: adds the units, re-averages the product's
 * cost, and books the purchase (inventory up; cash down or supplier owed).
 */
export async function receiveStock(input: {
  productId: string;
  warehouseId: string;
  quantity: number;
  unitCostCentavos: number;
  paidInCash: boolean;
  note?: string | null;
  date?: Date;
}) {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error("Quantity must be a whole number above zero.");
  if (!Number.isInteger(input.unitCostCentavos) || input.unitCostCentavos < 0) throw new Error("Unit cost cannot be negative.");
  const date = input.date ?? new Date();

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });
    const before = await onHand(tx, product.id);
    const movement = await tx.stockMovement.create({
      data: {
        productId: product.id,
        warehouseId: input.warehouseId,
        type: "RECEIPT",
        quantity: input.quantity,
        unitCostCentavos: input.unitCostCentavos,
        note: input.note || null,
        occurredAt: date,
      },
    });
    await tx.product.update({
      where: { id: product.id },
      data: { unitCostCentavos: movingAverageCost(before, product.unitCostCentavos, input.quantity, input.unitCostCentavos) },
    });
    const value = input.quantity * input.unitCostCentavos;
    if (value > 0) {
      await postEntry(tx, {
        brandId: product.brandId,
        date,
        memo: `Received ${input.quantity} × ${product.sku}`,
        sourceType: "STOCK",
        sourceId: movement.id,
        lines: transfer(A.INVENTORY, input.paidInCash ? A.CASH : A.PAYABLE, value),
      });
    }
    return movement;
  });
}

/**
 * A count correction, damage or write-off. `quantity` is the change (negative
 * to remove). Valued at the product's current cost against "Inventory
 * adjustments", so shrinkage shows up in the P&L instead of vanishing.
 */
export async function adjustStock(input: { productId: string; warehouseId: string; quantity: number; note: string; date?: Date }) {
  if (!Number.isInteger(input.quantity) || input.quantity === 0) throw new Error("Adjustment must be a non-zero whole number.");
  const date = input.date ?? new Date();

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });
    const movement = await tx.stockMovement.create({
      data: {
        productId: product.id,
        warehouseId: input.warehouseId,
        type: "ADJUSTMENT",
        quantity: input.quantity,
        unitCostCentavos: product.unitCostCentavos,
        note: input.note || null,
        occurredAt: date,
      },
    });
    const value = Math.abs(input.quantity) * product.unitCostCentavos;
    if (value > 0) {
      await postEntry(tx, {
        brandId: product.brandId,
        date,
        memo: `Stock adjustment ${input.quantity > 0 ? "+" : ""}${input.quantity} × ${product.sku}${input.note ? ` — ${input.note}` : ""}`,
        sourceType: "STOCK",
        sourceId: movement.id,
        lines: input.quantity > 0 ? transfer(A.INVENTORY, A.INVENTORY_ADJUSTMENT, value) : transfer(A.INVENTORY_ADJUSTMENT, A.INVENTORY, value),
      });
    }
    return movement;
  });
}

/** Move units between two warehouses. No money moves; the cost travels with them. */
export async function transferStock(input: { productId: string; fromWarehouseId: string; toWarehouseId: string; quantity: number; note?: string | null }) {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error("Quantity must be a whole number above zero.");
  if (input.fromWarehouseId === input.toWarehouseId) throw new Error("Pick two different warehouses.");
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });
    const base = { productId: product.id, type: "TRANSFER" as const, unitCostCentavos: product.unitCostCentavos, note: input.note || null };
    await tx.stockMovement.create({ data: { ...base, warehouseId: input.fromWarehouseId, quantity: -input.quantity } });
    await tx.stockMovement.create({ data: { ...base, warehouseId: input.toWarehouseId, quantity: input.quantity } });
  });
}
