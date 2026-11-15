import type { Db } from "@/lib/prisma";
import { isAccountCode } from "./accounts";
import { assertBalanced, balancesOf, type Balances, type LineDraft } from "./postings";

export interface EntryInput {
  brandId: string;
  date: Date;
  memo: string;
  sourceType: "ORDER" | "STOCK" | "MANUAL";
  sourceId?: string | null;
  lines: LineDraft[];
}

/** The only way a journal entry is written. Refuses anything unbalanced. */
export async function postEntry(db: Db, input: EntryInput) {
  const lines = input.lines.filter((l) => l.debitCentavos || l.creditCentavos);
  if (!lines.length) return null;
  assertBalanced(lines);
  for (const l of lines) if (!isAccountCode(l.accountCode)) throw new Error(`Unknown account ${l.accountCode}`);
  return db.journalEntry.create({
    data: {
      brandId: input.brandId,
      date: input.date,
      memo: input.memo.slice(0, 300),
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      lines: { create: lines },
    },
  });
}

/** Everything already posted because of one source (e.g. one order). */
export async function postedBalances(db: Db, sourceType: string, sourceId: string): Promise<Balances> {
  const lines = await db.journalLine.findMany({
    where: { entry: { sourceType, sourceId } },
    select: { accountCode: true, debitCentavos: true, creditCentavos: true },
  });
  return balancesOf(lines);
}
