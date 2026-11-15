// Stock rules, pure. Same "desired state, post the difference" idea as the
// ledger: an order's units should be out of the warehouse exactly while the
// parcel is with the courier or the customer.

/** Statuses during which the goods are physically out of the warehouse. */
const OUT_STATUSES = new Set(["SHIPPED", "DELIVERED", "RETURNING"]);

export function isOut(status: string): boolean {
  return OUT_STATUSES.has(status);
}

export interface ItemForStock {
  productId: string | null;
  quantity: number;
}

/** Units per product that should currently be out because of this order. */
export function desiredOut(status: string, items: readonly ItemForStock[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isOut(status)) return out;
  for (const it of items) {
    if (!it.productId || it.quantity <= 0) continue;
    out[it.productId] = (out[it.productId] ?? 0) + it.quantity;
  }
  return out;
}

export interface MovementDraft {
  productId: string;
  /** Positive = back into the warehouse, negative = out. */
  quantity: number;
}

/**
 * Movements that take the warehouse from what has been posted for an order to
 * what should be. `postedNet` is the sum of the order's existing movements per
 * product (so −2 means two units are currently out).
 */
export function stockDelta(desired: Record<string, number>, postedNet: Record<string, number>): MovementDraft[] {
  const moves: MovementDraft[] = [];
  const ids = [...new Set([...Object.keys(desired), ...Object.keys(postedNet)])].sort();
  for (const id of ids) {
    const diff = -(desired[id] ?? 0) - (postedNet[id] ?? 0);
    if (diff !== 0) moves.push({ productId: id, quantity: diff });
  }
  return moves;
}

/**
 * Moving-average cost after a receipt. Units already on hand keep their old
 * cost; the new units come in at theirs. A negative on-hand (oversold) is
 * treated as zero so it cannot drag the average somewhere absurd.
 */
export function movingAverageCost(onHand: number, currentCost: number, receivedQty: number, receivedCost: number): number {
  const base = Math.max(0, onHand);
  const total = base + receivedQty;
  if (total <= 0) return receivedCost;
  return Math.round((base * currentCost + receivedQty * receivedCost) / total);
}
