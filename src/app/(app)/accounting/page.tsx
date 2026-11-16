import { deleteManualEntry, recordTransaction } from "@/app/actions";
import { PageControls } from "@/components/page-controls";
import { Back, Banner, Button, Card, Field, PageHeader, Pill, StatTile, cn, inputClass, tableBody, tableHead, td, th } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { EXPENSE_ACCOUNTS, account } from "@/lib/accounting/accounts";
import { formatPeso, formatPesoExact } from "@/lib/money";
import { pageContext, type SearchParams } from "@/lib/page-context";
import { phDayKey } from "@/lib/period";
import { ledgerBalances, position, profitAndLoss } from "@/lib/reports";

const day = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });

/** One row of a statement. `subtract` rows are shown as deductions. */
function Line({ label, amount, strong, indent, subtract }: { label: string; amount: number; strong?: boolean; indent?: boolean; subtract?: boolean }) {
  const shown = subtract ? -amount : amount;
  return (
    <div className={cn("flex justify-between gap-4 py-1.5 text-[13px]", strong && "mt-1 border-t border-border pt-2 font-semibold")}>
      <span className={indent ? "pl-4 text-text-muted" : "text-text"}>{label}</span>
      <span className={cn("tnum", strong && shown < 0 ? "text-critical" : strong && shown > 0 ? "text-text" : indent ? "text-text-muted" : "text-text")}>{formatPeso(shown)}</span>
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
      <PageHeader
        title="Accounting"
        description="Orders and stock book themselves. Record everything else here — ad spend, courier remittances, expenses."
        actions={<PageControls ctx={ctx} />}
        meta={<>{ctx.periodRange} · Manila time</>}
      />
      <Banner ok={ctx.ok} error={ctx.error} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Sales" value={formatPeso(pnl.sales)} sub="delivered in the period" />
        <StatTile label="Total costs" value={formatPeso(pnl.cogs + pnl.totalExpenses)} sub="goods, ads and expenses" />
        <StatTile label="Net profit" value={formatPeso(pnl.netProfit)} tone={pnl.netProfit > 0 ? "healthy" : pnl.netProfit < 0 ? "critical" : "neutral"} sub={pnl.sales ? `${((pnl.netProfit / pnl.sales) * 100).toFixed(1)}% of sales` : "no sales yet"} emphasis />
        <StatTile label="Cash now" value={formatPeso(pos.cash)} tone={pos.cash < 0 ? "critical" : "neutral"} sub="as recorded" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Profit & loss" subtitle={`${ctx.periodRange} — a sale counts on the day it is delivered`}>
          <Line label="Sales" amount={pnl.sales} />
          <Line label="Cost of goods sold" amount={pnl.cogs} subtract indent />
          <Line label="Gross profit" amount={pnl.grossProfit} strong />
          {pnl.expenses.map((e) => (
            <Line key={e.code} label={e.name} amount={e.amount} subtract indent />
          ))}
          {pnl.expenses.length === 0 ? <p className="py-1.5 pl-4 text-[13px] text-text-faint">No expenses recorded.</p> : null}
          <Line label="Net profit" amount={pnl.netProfit} strong />
        </Card>

        <Card title="Where the money is" subtitle="Right now, not just this period">
          <Line label="Cash" amount={pos.cash} />
          <Line label="Owed to us by couriers & gateways" amount={pos.receivable} />
          <Line label="Inventory, incl. parcels in transit" amount={pos.inventory} />
          <Line label="Owed to suppliers" amount={pos.payable} subtract />
          <Line label="Net" amount={pos.cash + pos.receivable + pos.inventory - pos.payable} strong />
          <p className="mt-3 text-[11px] leading-relaxed text-text-faint">
            Cash only moves when you record it below. Start by recording the money already in the business as &ldquo;Owner put money in&rdquo;.
          </p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Record a transaction">
          {ctx.brands.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-text-faint">Add a brand in Settings first.</p>
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
          <Card flush title="Journal" subtitle="Every entry in the period. Order and stock entries correct themselves; hand-recorded ones can be removed.">
            {entries.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-text-faint">No entries in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead className={tableHead}>
                    <tr>
                      <th className={th}>Date</th>
                      <th className={th}>What</th>
                      <th className={th}>Accounts</th>
                      <th className={`${th} text-right`}>Amount</th>
                      <th className={th} />
                    </tr>
                  </thead>
                  <tbody className={tableBody}>
                    {entries.map((e) => {
                      const debits = e.lines.filter((l) => l.debitCentavos > 0);
                      const credits = e.lines.filter((l) => l.creditCentavos > 0);
                      const amount = debits.reduce((s, l) => s + l.debitCentavos, 0);
                      return (
                        <tr key={e.id} className="align-top hover:bg-surface-2/50">
                          <td className={`${td} whitespace-nowrap text-text-muted`}>{day.format(e.date)}</td>
                          <td className={td}>
                            <div>{e.memo}</div>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <Pill tone={e.sourceType === "MANUAL" ? "accent" : e.sourceType === "ORDER" ? "info" : "neutral"}>
                                {e.sourceType === "MANUAL" ? "Recorded" : e.sourceType === "ORDER" ? "Order" : "Stock"}
                              </Pill>
                              {!ctx.brand ? <span className="text-xs text-text-faint">{e.brand.name}</span> : null}
                            </div>
                          </td>
                          <td className={`${td} text-xs text-text-muted`}>
                            {debits.map((l) => account(l.accountCode).name).join(", ")}
                            <span className="text-text-faint"> ← </span>
                            {credits.map((l) => account(l.accountCode).name).join(", ")}
                          </td>
                          <td className={`${td} text-right font-medium tnum`}>{formatPesoExact(amount)}</td>
                          <td className={`${td} text-right`}>
                            {e.sourceType === "MANUAL" ? (
                              <form action={deleteManualEntry}>
                                <Back to={here} />
                                <input type="hidden" name="entryId" value={e.id} />
                                <button type="submit" className="h-7 rounded-md px-2 text-xs font-medium text-text-muted hover:bg-critical-soft hover:text-critical">
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
