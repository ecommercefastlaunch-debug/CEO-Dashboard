import { deleteManualEntry, recordTransaction } from "@/app/actions";
import { Back, Banner, Button, Card, Empty, Field, Filters, PageTitle, inputClass, td, th } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { EXPENSE_ACCOUNTS, account } from "@/lib/accounting/accounts";
import { formatPeso, formatPesoExact } from "@/lib/money";
import { pageContext, type SearchParams } from "@/lib/page-context";
import { RANGE_LABEL, phDayKey } from "@/lib/period";
import { ledgerBalances, position, profitAndLoss } from "@/lib/reports";

const day = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });

/** One row of a statement. `subtract` rows are shown as deductions. */
function Line({ label, amount, strong, indent, subtract }: { label: string; amount: number; strong?: boolean; indent?: boolean; subtract?: boolean }) {
  const shown = subtract ? -amount : amount;
  return (
    <div className={`flex justify-between gap-4 py-1.5 text-sm ${strong ? "border-t border-stone-200 font-semibold" : ""}`}>
      <span className={indent ? "pl-4 text-stone-600" : ""}>{label}</span>
      <span className={`num ${strong && shown < 0 ? "text-red-700" : ""}`}>{formatPeso(shown)}</span>
    </div>
  );
}

export default async function AccountingPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await pageContext(searchParams, "mtd");
  const scope = { brandId: ctx.brand?.id ?? null };

  const [periodBalances, allBalances, entries] = await Promise.all([
    ledgerBalances(scope, ctx.period),
    ledgerBalances(scope, null),
    prisma.journalEntry.findMany({
      where: { brandId: scope.brandId ?? undefined, date: { gte: ctx.period.from, lt: ctx.period.to } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 60,
      include: { lines: true, brand: { select: { name: true } } },
    }),
  ]);
  const pnl = profitAndLoss(periodBalances);
  const pos = position(allBalances);
  const here = ctx.href("/accounting");

  return (
    <>
      <PageTitle title="Accounting" hint="Orders and stock book themselves. Record everything else here — ad spend, remittances, expenses." />
      <Banner ok={ctx.ok} error={ctx.error} />
      <Filters ctx={ctx} path="/accounting" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Profit & loss — ${RANGE_LABEL[ctx.range].toLowerCase()}`}>
          <Line label="Sales" amount={pnl.sales} />
          <Line label="Cost of goods sold" amount={pnl.cogs} subtract indent />
          <Line label="Gross profit" amount={pnl.grossProfit} strong />
          {pnl.expenses.map((e) => (
            <Line key={e.code} label={e.name} amount={e.amount} subtract indent />
          ))}
          {pnl.expenses.length === 0 ? <p className="py-1.5 pl-4 text-sm text-stone-400">No expenses recorded.</p> : null}
          <Line label="Net profit" amount={pnl.netProfit} strong />
          <p className="mt-3 text-xs text-stone-400">A sale is counted on the day the order is delivered.</p>
        </Card>

        <Card title="Where the money is — right now">
          <Line label="Cash" amount={pos.cash} />
          <Line label="Owed to us by couriers & gateways" amount={pos.receivable} />
          <Line label="Inventory, incl. parcels in transit" amount={pos.inventory} />
          <Line label="Owed to suppliers" amount={pos.payable} subtract />
          <Line label="Net" amount={pos.cash + pos.receivable + pos.inventory - pos.payable} strong />
          <p className="mt-3 text-xs text-stone-400">
            Cash only moves when you record it below. Start by recording the money already in the business as &ldquo;Owner put money in&rdquo;.
          </p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Record a transaction">
          {ctx.brands.length === 0 ? (
            <Empty>Add a brand in Settings first.</Empty>
          ) : (
            <form action={recordTransaction} className="space-y-3">
              <Back to={here} />
              <Field label="What happened">
                <select name="kind" required className={inputClass}>
                  <option value="ad_spend">Paid for ads</option>
                  <option value="remittance">Received a courier / gateway remittance</option>
                  <optgroup label="Paid an expense">
                    {EXPENSE_ACCOUNTS.filter((a) => a.code !== "6000").map((a) => (
                      <option key={a.code} value={`expense:${a.code}`}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                  <option value="supplier_payment">Paid a supplier for stock received earlier</option>
                  <option value="owner_in">Owner put money in</option>
                  <option value="owner_out">Owner took money out</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount (₱)">
                  <input name="amount" inputMode="decimal" required placeholder="0.00" className={inputClass} />
                </Field>
                <Field label="Date">
                  <input name="date" type="date" required defaultValue={phDayKey(new Date())} className={inputClass} />
                </Field>
              </div>
              <Field label="Brand">
                <select name="brandId" required defaultValue={ctx.brand?.id} className={inputClass}>
                  {ctx.brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Note (optional)">
                <input name="note" placeholder="Meta ads Nov 1–7, J&T batch 12…" className={inputClass} />
              </Field>
              <Button>Record</Button>
            </form>
          )}
        </Card>

        <div className="min-w-0 lg:col-span-2">
          <Card title="Journal">
            {entries.length === 0 ? (
              <Empty>No entries in this period.</Empty>
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr>
                      <th className={th}>Date</th>
                      <th className={th}>What</th>
                      <th className={th}>Accounts</th>
                      <th className={`${th} text-right`}>Amount</th>
                      <th className={th} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {entries.map((e) => {
                      const debits = e.lines.filter((l) => l.debitCentavos > 0);
                      const credits = e.lines.filter((l) => l.creditCentavos > 0);
                      const amount = debits.reduce((s, l) => s + l.debitCentavos, 0);
                      return (
                        <tr key={e.id} className="align-top">
                          <td className={`${td} whitespace-nowrap text-stone-600`}>{day.format(e.date)}</td>
                          <td className={td}>
                            <div>{e.memo}</div>
                            {!ctx.brand ? <div className="text-xs text-stone-500">{e.brand.name}</div> : null}
                          </td>
                          <td className={`${td} text-xs text-stone-600`}>
                            {debits.map((l) => account(l.accountCode).name).join(", ")}
                            <span className="text-stone-400"> ← </span>
                            {credits.map((l) => account(l.accountCode).name).join(", ")}
                          </td>
                          <td className={`${td} num text-right`}>{formatPesoExact(amount)}</td>
                          <td className={`${td} text-right`}>
                            {e.sourceType === "MANUAL" ? (
                              <form action={deleteManualEntry}>
                                <Back to={here} />
                                <input type="hidden" name="entryId" value={e.id} />
                                <button type="submit" className="text-xs text-stone-500 underline hover:text-red-700">
                                  Remove
                                </button>
                              </form>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
