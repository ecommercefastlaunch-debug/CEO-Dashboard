import { adjustStockAction, createProduct, receiveStockAction, transferStockAction, updateProduct } from "@/app/actions";
import { PageControls } from "@/components/page-controls";
import { Back, Banner, Button, Card, Empty, Field, PageHeader, Pill, StatTile, cn, inputClass, tableBody, tableHead, td, th, type Tone } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { formatPeso, formatPesoExact } from "@/lib/money";
import { pageContext, type SearchParams } from "@/lib/page-context";
import { stockRows } from "@/lib/reports";
import { currentRole } from "@/lib/session";

const when = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const TYPE: Record<string, { label: string; tone: Tone }> = {
  RECEIPT: { label: "Received", tone: "healthy" },
  SHIPMENT: { label: "Shipped", tone: "info" },
  RETURN: { label: "Returned", tone: "warning" },
  ADJUSTMENT: { label: "Adjusted", tone: "neutral" },
  TRANSFER: { label: "Transfer", tone: "accent" },
};

export default async function WarehousePage({ searchParams }: { searchParams: SearchParams }) {
  const [ctx, role] = await Promise.all([pageContext(searchParams), currentRole()]);
  const owner = role === "owner";
  const sp = await searchParams;

  const warehouses = await prisma.warehouse.findMany({ where: { active: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  const warehouse = warehouses.find((w) => w.id === sp.warehouse) ?? null;
  const scope = { brandId: ctx.brand?.id ?? null };

  const [rows, movements] = await Promise.all([
    stockRows(scope, warehouse?.id),
    prisma.stockMovement.findMany({
      where: { warehouseId: warehouse?.id, product: { brandId: scope.brandId ?? undefined } },
      orderBy: { occurredAt: "desc" },
      take: 25,
      include: { product: { select: { sku: true, name: true } }, warehouse: { select: { name: true } } },
    }),
  ]);

  const here = (() => {
    const u = new URL(ctx.href("/warehouse"), "http://x");
    u.searchParams.delete("range");
    if (warehouse) u.searchParams.set("warehouse", warehouse.id);
    return u.pathname + u.search;
  })();
  const totalValue = rows.reduce((s, r) => s + r.valueCentavos, 0);
  const productOptions = rows.map((r) => (
    <option key={r.productId} value={r.productId}>
      {ctx.brand ? "" : `${r.brandName} · `}
      {r.sku} — {r.name}
    </option>
  ));
  const warehouseOptions = warehouses.map((w) => (
    <option key={w.id} value={w.id}>
      {w.name}
    </option>
  ));
  const noWarehouse = warehouses.length === 0;
  const unitsOnHand = rows.reduce((s, r) => s + Math.max(0, r.onHand), 0);
  const lowCount = rows.filter((r) => r.onHand <= 0 || (r.reorderPoint > 0 && r.low)).length;

  return (
    <>
      <PageHeader
        title={ctx.brand ? `Warehouse — ${ctx.brand.name}` : "Warehouse"}
        description="Stock goes down by itself when an order ships and comes back when it is returned. Receiving, counts and transfers are entered here."
        actions={<PageControls ctx={ctx} showRange={false} />}
      />
      <Banner ok={ctx.ok} error={ctx.error} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Products" value={rows.length.toLocaleString("en-PH")} sub={warehouse ? warehouse.name : `${warehouses.length} warehouse${warehouses.length === 1 ? "" : "s"}`} />
        <StatTile label="Units on hand" value={unitsOnHand.toLocaleString("en-PH")} sub="across these products" />
        {owner ? <StatTile label="Stock value" value={formatPeso(totalValue)} sub="at cost" /> : <StatTile label="Moved recently" value={movements.length.toLocaleString("en-PH")} sub="latest movements below" />}
        <StatTile label="Low or out" value={lowCount.toLocaleString("en-PH")} tone={lowCount ? "warning" : "neutral"} sub="at or below reorder level" />
      </div>

      {warehouses.length > 1 ? (
        <form className="mb-4 flex items-center gap-2 text-[13px]" action="/warehouse">
          {ctx.brand ? <input type="hidden" name="brand" value={ctx.brand.slug} /> : null}
          <label htmlFor="wh" className="text-text-muted">
            Showing
          </label>
          <select id="wh" name="warehouse" defaultValue={warehouse?.id ?? ""} className={`${inputClass} w-auto`}>
            <option value="">All warehouses</option>
            {warehouseOptions}
          </select>
          <Button variant="secondary">Show</Button>
        </form>
      ) : null}

      <Card flush title="Stock" subtitle="On hand per product. Red means more has shipped than was ever received.">
        {rows.length === 0 ? (
          <div className="p-4">
            <Empty title="No products yet">{owner ? "Add your first product below — the SKU must match the SKU on orders." : "The owner adds products."}</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className={tableHead}>
                <tr>
                  <th className={th}>Product</th>
                  <th className={`${th} text-right`}>On hand</th>
                  {owner ? <th className={`${th} text-right`}>Unit cost</th> : null}
                  {owner ? <th className={`${th} text-right`}>Value</th> : null}
                  <th className={`${th} text-right`}>Reorder at</th>
                </tr>
              </thead>
              <tbody className={tableBody}>
                {rows.map((r) => (
                  <tr key={r.productId} className="hover:bg-surface-2/50">
                    <td className={td}>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-text-faint">
                        <span className="font-mono">{r.sku}</span>
                        {ctx.brand ? "" : ` · ${r.brandName}`}
                      </div>
                    </td>
                    <td className={`${td} tnum text-right font-medium ${r.onHand < 0 ? "text-critical" : r.low && r.reorderPoint > 0 ? "text-warning" : ""}`}>
                      {r.onHand.toLocaleString("en-PH")}
                      {r.onHand < 0 ? <div className="text-xs font-normal">more shipped than received</div> : r.low && r.reorderPoint > 0 ? <div className="text-xs font-normal">reorder</div> : null}
                    </td>
                    {owner ? (
                      <td className={`${td} tnum text-right`}>
                        {r.unitCostCentavos > 0 ? formatPesoExact(r.unitCostCentavos) : <span className="text-warning">not set</span>}
                      </td>
                    ) : null}
                    {owner ? <td className={`${td} tnum text-right`}>{formatPeso(r.valueCentavos)}</td> : null}
                    <td className={`${td} tnum text-right text-text-muted`}>{r.reorderPoint || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Receive stock">
          {rows.length === 0 || noWarehouse ? (
            <p className="py-4 text-center text-[13px] text-text-faint">{noWarehouse ? "Add a warehouse in Settings first." : "Add a product first."}</p>
          ) : (
            <form action={receiveStockAction} className="grid grid-cols-2 gap-3">
              <Back to={here} />
              <div className="col-span-2">
                <Field label="Product">
                  <select name="productId" required className={inputClass}>
                    {productOptions}
                  </select>
                </Field>
              </div>
              <Field label="Quantity">
                <input name="quantity" type="number" min={1} step={1} required className={inputClass} />
              </Field>
              <Field label="Into">
                <select name="warehouseId" required defaultValue={warehouse?.id} className={inputClass}>
                  {warehouseOptions}
                </select>
              </Field>
              {owner ? (
                <>
                  <Field label="Cost per unit (₱)" hint="Leave blank to use the current cost.">
                    <input name="unitCost" inputMode="decimal" placeholder="0.00" className={inputClass} />
                  </Field>
                  <Field label="Payment">
                    <select name="payment" className={inputClass}>
                      <option value="payable">Not paid yet (owed to supplier)</option>
                      <option value="cash">Paid in cash</option>
                    </select>
                  </Field>
                </>
              ) : null}
              <div className="col-span-2">
                <Field label="Note (optional)">
                  <input name="note" placeholder="Supplier, delivery receipt no." className={inputClass} />
                </Field>
              </div>
              <div className="col-span-2">
                <Button>Receive</Button>
              </div>
            </form>
          )}
        </Card>

        <Card title="Correct a count">
          {rows.length === 0 || noWarehouse ? (
            <p className="py-4 text-center text-[13px] text-text-faint">Nothing to adjust yet.</p>
          ) : (
            <form action={adjustStockAction} className="grid grid-cols-2 gap-3">
              <Back to={here} />
              <div className="col-span-2">
                <Field label="Product">
                  <select name="productId" required className={inputClass}>
                    {productOptions}
                  </select>
                </Field>
              </div>
              <Field label="Change" hint="−2 for two damaged or missing; +3 for three found.">
                <input name="quantity" type="number" step={1} required placeholder="-2" className={inputClass} />
              </Field>
              <Field label="In">
                <select name="warehouseId" required defaultValue={warehouse?.id} className={inputClass}>
                  {warehouseOptions}
                </select>
              </Field>
              <div className="col-span-2">
                <Field label="Reason">
                  <input name="note" required placeholder="Damaged, count correction, sample…" className={inputClass} />
                </Field>
              </div>
              <div className="col-span-2">
                <Button variant="secondary">Adjust</Button>
              </div>
            </form>
          )}
        </Card>

        {warehouses.length > 1 && rows.length > 0 ? (
          <Card title="Move between warehouses">
            <form action={transferStockAction} className="grid grid-cols-2 gap-3">
              <Back to={here} />
              <div className="col-span-2">
                <Field label="Product">
                  <select name="productId" required className={inputClass}>
                    {productOptions}
                  </select>
                </Field>
              </div>
              <Field label="From">
                <select name="fromWarehouseId" required className={inputClass}>
                  {warehouseOptions}
                </select>
              </Field>
              <Field label="To">
                <select name="toWarehouseId" required defaultValue={warehouses[1]?.id} className={inputClass}>
                  {warehouseOptions}
                </select>
              </Field>
              <Field label="Quantity">
                <input name="quantity" type="number" min={1} step={1} required className={inputClass} />
              </Field>
              <Field label="Note (optional)">
                <input name="note" className={inputClass} />
              </Field>
              <div className="col-span-2">
                <Button variant="secondary">Move</Button>
              </div>
            </form>
          </Card>
        ) : null}

        {owner ? (
          <Card title="Add a product">
            {ctx.brands.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-text-faint">Add a brand in Settings first.</p>
            ) : (
              <form action={createProduct} className="grid grid-cols-2 gap-3">
                <Back to={here} />
                <Field label="Brand">
                  <select name="brandId" required defaultValue={ctx.brand?.id} className={inputClass}>
                    {ctx.brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="SKU" hint="Exactly as it appears on orders.">
                  <input name="sku" required className={`${inputClass} font-mono`} />
                </Field>
                <div className="col-span-2">
                  <Field label="Name">
                    <input name="name" required className={inputClass} />
                  </Field>
                </div>
                <Field label="Cost per unit (₱)">
                  <input name="unitCost" inputMode="decimal" placeholder="0.00" className={inputClass} />
                </Field>
                <Field label="Reorder when stock reaches">
                  <input name="reorderPoint" type="number" min={0} step={1} placeholder="0" className={inputClass} />
                </Field>
                <div className="col-span-2">
                  <Button>Add product</Button>
                </div>
              </form>
            )}
          </Card>
        ) : null}

        {owner && rows.length > 0 ? (
          <Card title="Change a product's cost or reorder level">
            <form action={updateProduct} className="grid grid-cols-2 gap-3">
              <Back to={here} />
              <div className="col-span-2">
                <Field label="Product">
                  <select name="productId" required className={inputClass}>
                    {productOptions}
                  </select>
                </Field>
              </div>
              <Field label="Cost per unit (₱)" hint="Applies to orders that ship from now on.">
                <input name="unitCost" inputMode="decimal" required placeholder="0.00" className={inputClass} />
              </Field>
              <Field label="Reorder when stock reaches">
                <input name="reorderPoint" type="number" min={0} step={1} placeholder="0" className={inputClass} />
              </Field>
              <div className="col-span-2">
                <Button variant="secondary">Save</Button>
              </div>
            </form>
          </Card>
        ) : null}
      </div>

      <div className="mt-4">
        <Card flush title="Recent movements" subtitle="The latest 25 — every unit traces back to one of these.">
          {movements.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-text-faint">Nothing has moved yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px]">
                <thead className={tableHead}>
                  <tr>
                    <th className={th}>When</th>
                    <th className={th}>Product</th>
                    <th className={th}>What</th>
                    <th className={`${th} text-right`}>Qty</th>
                    <th className={th}>Note</th>
                  </tr>
                </thead>
                <tbody className={tableBody}>
                  {movements.map((m) => (
                    <tr key={m.id} className="hover:bg-surface-2/50">
                      <td className={`${td} whitespace-nowrap text-text-muted`}>{when.format(m.occurredAt)}</td>
                      <td className={td}>
                        {m.product.name} <span className="font-mono text-xs text-text-faint">{m.product.sku}</span>
                      </td>
                      <td className={td}>
                        <Pill tone={TYPE[m.type].tone}>{TYPE[m.type].label}</Pill>
                        {warehouses.length > 1 ? <span className="ml-1.5 text-xs text-text-faint">{m.warehouse.name}</span> : null}
                      </td>
                      <td className={cn(td, "text-right font-semibold tnum", m.quantity > 0 ? "text-healthy" : "")}>
                        {m.quantity > 0 ? "+" : ""}
                        {m.quantity}
                      </td>
                      <td className={`${td} text-text-muted`}>{m.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
