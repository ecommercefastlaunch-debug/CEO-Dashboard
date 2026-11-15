// What an order SHOULD look like in the ledger, and the entry that gets it
// there. Pure — no database — so the money rules can be tested exhaustively.
//
// The approach is "desired state, then post the difference". For an order we
// compute the balance each account ought to carry because of it, compare that
// with what has already been posted for the order, and post only the gap. That
// makes processing idempotent (the same webhook twice posts nothing the second
// time) and self-correcting (an order that goes DELIVERED → RETURNED, or whose
// amount is edited, is fixed by one more entry rather than by editing history).

import { A } from "./accounts";

/** Signed centavos per account: positive = debit balance, negative = credit. */
export type Balances = Record<string, number>;

export interface LineDraft {
  accountCode: string;
  debitCentavos: number;
  creditCentavos: number;
}

export interface OrderForPosting {
  status: string;
  excluded: boolean;
  totalCentavos: number;
  courierFeeCentavos: number;
  /** Frozen cost of every matched line: Σ quantity × unit cost. */
  cogsCentavos: number;
}

/**
 * The ledger footprint an order should have right now.
 *
 * DELIVERED — the sale is real: the courier (or gateway) owes us the total,
 *   the goods are gone, and the courier's fee comes out of what it remits.
 * RETURNED  — no sale, the goods are back on the shelf, but the courier still
 *   charges for the trip. That fee is the cost of an RTS.
 * Anything else — nothing yet. Revenue is recognised on delivery, not on order.
 */
export function desiredOrderBalances(o: OrderForPosting): Balances {
  const b: Balances = {};
  if (o.excluded) return b;
  const add = (code: string, amount: number) => {
    if (amount) b[code] = (b[code] ?? 0) + amount;
  };

  if (o.status === "DELIVERED") {
    add(A.RECEIVABLE, o.totalCentavos);
    add(A.SALES, -o.totalCentavos);
    add(A.COGS, o.cogsCentavos);
    add(A.INVENTORY, -o.cogsCentavos);
    add(A.SHIPPING, o.courierFeeCentavos);
    add(A.RECEIVABLE, -o.courierFeeCentavos);
  } else if (o.status === "RETURNED") {
    add(A.SHIPPING, o.courierFeeCentavos);
    add(A.RECEIVABLE, -o.courierFeeCentavos);
  }
  return b;
}

/** Collapse posted lines into signed balances per account. */
export function balancesOf(lines: readonly LineDraft[]): Balances {
  const b: Balances = {};
  for (const l of lines) {
    const v = (b[l.accountCode] ?? 0) + l.debitCentavos - l.creditCentavos;
    if (v) b[l.accountCode] = v;
    else delete b[l.accountCode];
  }
  return b;
}

/** The lines that move `posted` to `desired`. Empty when they already agree. */
export function deltaLines(desired: Balances, posted: Balances): LineDraft[] {
  const lines: LineDraft[] = [];
  const codes = [...new Set([...Object.keys(desired), ...Object.keys(posted)])].sort();
  for (const code of codes) {
    const diff = (desired[code] ?? 0) - (posted[code] ?? 0);
    if (diff > 0) lines.push({ accountCode: code, debitCentavos: diff, creditCentavos: 0 });
    else if (diff < 0) lines.push({ accountCode: code, debitCentavos: 0, creditCentavos: -diff });
  }
  return lines;
}

/** Debits must equal credits. Thrown on, never silently posted. */
export function assertBalanced(lines: readonly LineDraft[]): void {
  let debit = 0;
  let credit = 0;
  for (const l of lines) {
    if (l.debitCentavos < 0 || l.creditCentavos < 0) throw new Error("Journal lines cannot be negative.");
    if (l.debitCentavos && l.creditCentavos) throw new Error("A journal line is a debit or a credit, not both.");
    debit += l.debitCentavos;
    credit += l.creditCentavos;
  }
  if (debit !== credit) throw new Error(`Unbalanced entry: debits ${debit} ≠ credits ${credit}.`);
}

/** A simple two-sided entry: `amount` debited to one account, credited to another. */
export function transfer(debitCode: string, creditCode: string, amountCentavos: number): LineDraft[] {
  if (amountCentavos <= 0) throw new Error("Amount must be greater than zero.");
  return [
    { accountCode: debitCode, debitCentavos: amountCentavos, creditCentavos: 0 },
    { accountCode: creditCode, debitCentavos: 0, creditCentavos: amountCentavos },
  ];
}
