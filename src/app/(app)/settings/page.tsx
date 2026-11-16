import { cookies, headers } from "next/headers";
import {
  createApiKey,
  createBrand,
  createConnection,
  createWarehouse,
  deleteConnection,
  revokeApiKey,
  setDefaultWarehouse,
  syncNow,
} from "@/app/actions";
import { Back, Banner, Button, Card, Field, PageHeader, Pill, cn, inputClass, tableBody, tableHead, td, th, type Tone } from "@/components/ui";
import { FLASH_KEY_COOKIE } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { pageContext, type SearchParams } from "@/lib/page-context";

const when = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const EVENT_TONE: Record<string, Tone> = { APPLIED: "healthy", ERROR: "critical", REJECTED: "critical", PENDING: "warning", IGNORED: "neutral" };

function Copyable({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-text-muted">{label}</div>
      <code className="mt-1 block overflow-x-auto whitespace-nowrap rounded-md border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-text select-all">{value}</code>
    </div>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await pageContext(searchParams);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const newKey = (await cookies()).get(FLASH_KEY_COOKIE)?.value ?? null;

  const [warehouses, connections, keys, events] = await Promise.all([
    prisma.warehouse.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
    prisma.channelConnection.findMany({ orderBy: { createdAt: "asc" }, include: { brand: { select: { name: true } }, _count: { select: { orders: true } } } }),
    prisma.apiKey.findMany({ where: { revokedAt: null }, orderBy: { createdAt: "desc" }, include: { brand: { select: { name: true } } } }),
    prisma.webhookEvent.findMany({ orderBy: { receivedAt: "desc" }, take: 15, include: { connection: { select: { label: true } } } }),
  ]);

  const secretOf = (blob: string | null) => {
    if (!blob) return null;
    try {
      return decryptSecret(blob);
    } catch {
      return null;
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="Brands, warehouses, the stores orders come from, and the keys your bots use." />
      <Banner ok={ctx.ok} error={ctx.error} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Brands">
          {ctx.brands.length ? (
            <ul className="mb-4 divide-y divide-border">
              {ctx.brands.map((b) => (
                <li key={b.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium">{b.name}</span>
                  <code className="font-mono text-xs text-text-muted">{b.slug}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-[13px] text-text-faint">No brands yet.</p>
          )}
          <form action={createBrand} className="flex items-end gap-2">
            <Back to="/settings" />
            <div className="flex-1">
              <Field label="New brand name">
                <input name="name" required className={inputClass} />
              </Field>
            </div>
            <Button>Add</Button>
          </form>
        </Card>

        <Card title="Warehouses">
          {warehouses.length ? (
            <ul className="mb-4 divide-y divide-border">
              {warehouses.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-medium">{w.name}</span>
                  {w.isDefault ? (
                    <span className="text-xs text-text-muted">orders ship from here</span>
                  ) : (
                    <form action={setDefaultWarehouse}>
                      <Back to="/settings" />
                      <input type="hidden" name="warehouseId" value={w.id} />
                      <button type="submit" className="text-xs text-text-muted underline hover:text-text">
                        Ship orders from here
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-[13px] text-text-faint">None yet — one called &ldquo;Main warehouse&rdquo; is created when the first order ships.</p>
          )}
          <form action={createWarehouse} className="flex items-end gap-2">
            <Back to="/settings" />
            <div className="flex-1">
              <Field label="New warehouse name">
                <input name="name" required className={inputClass} />
              </Field>
            </div>
            <Button>Add</Button>
          </form>
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Sales channels">
          {connections.length === 0 ? (
            <p className="mb-4 text-[13px] text-text-faint">No channels connected yet.</p>
          ) : (
            <ul className="mb-5 grid gap-4">
              {connections.map((c) => {
                const url = `${origin}/api/webhooks/${c.channel === "PANCAKE" ? "pancake" : "shopify"}/${c.webhookKey}`;
                return (
                  <li key={c.id} className="min-w-0 rounded-xl border border-border bg-surface-2/30 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <span className="font-medium">{c.label}</span>
                        <span className="ml-2 text-xs text-text-muted">
                          {c.brand.name} · {c.channel === "PANCAKE" ? "Pancake POS" : "Shopify"} · {c._count.orders} order{c._count.orders === 1 ? "" : "s"}
                        </span>
                      </div>
                      <span className="text-xs text-text-muted">
                        {c.lastEventAt ? `Last order update ${when.format(c.lastEventAt)}` : "No order received yet"}
                      </span>
                    </div>
                    {c.lastError ? <p className="mt-2 rounded-md border border-critical/40 bg-critical-soft px-2.5 py-1.5 text-xs text-critical">Last error: {c.lastError}</p> : null}
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Copyable label="Webhook address — paste into the channel" value={url} />
                      {c.channel === "PANCAKE" ? (
                        <Copyable label="Request header to add in Pancake: x-webhook-secret" value={secretOf(c.webhookSecret) ?? "(unreadable — SESSION_SECRET changed; re-create this connection)"} />
                      ) : (
                        <div className="min-w-0 text-xs text-text-muted">
                          <div className="font-medium">In Shopify</div>
                          Settings → Notifications → Webhooks. Add this address for: Order creation, Order update, Order cancellation, Order fulfillment, Order payment. Format: JSON.
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {c.apiSecret ? (
                        <form action={syncNow} className="flex items-center gap-2">
                          <Back to="/settings" />
                          <input type="hidden" name="connectionId" value={c.id} />
                          <select name="days" defaultValue="7" className={`${inputClass} w-auto py-1.5`} aria-label="How far back">
                            <option value="1">Last day</option>
                            <option value="7">Last 7 days</option>
                            <option value="30">Last 30 days</option>
                            <option value="90">Last 90 days</option>
                          </select>
                          <Button variant="secondary">Pull orders now</Button>
                        </form>
                      ) : (
                        <span className="text-xs text-text-muted">No API key saved — webhooks only, no backfill.</span>
                      )}
                      {c._count.orders === 0 ? (
                        <form action={deleteConnection}>
                          <Back to="/settings" />
                          <input type="hidden" name="connectionId" value={c.id} />
                          <Button variant="danger">Remove</Button>
                        </form>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {ctx.brands.length === 0 ? null : (
            <form action={createConnection} className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
              <Back to="/settings" />
              <Field label="Brand">
                <select name="brandId" required className={inputClass}>
                  {ctx.brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Channel" hint="Webcake pages submit into Pancake POS — choose Pancake.">
                <select name="channel" required className={inputClass}>
                  <option value="PANCAKE">Pancake POS (and Webcake)</option>
                  <option value="SHOPIFY">Shopify</option>
                </select>
              </Field>
              <Field label="Shop" hint="Pancake: shop ID. Shopify: your-store.myshopify.com">
                <input name="externalShopId" className={inputClass} />
              </Field>
              <Field label="API key / access token (optional)" hint="Lets the system pull missed orders. Stored encrypted.">
                <input name="apiSecret" type="password" autoComplete="off" className={inputClass} />
              </Field>
              <Field label="Shopify only: API secret key" hint="Shopify signs webhooks with it. Stored encrypted.">
                <input name="signingSecret" type="password" autoComplete="off" className={inputClass} />
              </Field>
              <div className="flex items-end">
                <Button>Connect channel</Button>
              </div>
            </form>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Bot access">
          <p className="mb-3 text-sm text-text-muted">
            A key lets a bot read numbers — sales, profit, orders, stock. It cannot change anything, and never sees customer names or phone numbers.
          </p>
          {newKey ? (
            <div className="mb-4 rounded-lg border border-healthy/40 bg-healthy-soft p-3">
              <Copyable label="Your new key — copy it now, it will not be shown again" value={newKey} />
            </div>
          ) : null}
          {keys.length ? (
            <ul className="mb-4 divide-y divide-border">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <span className="font-medium">{k.name}</span>
                    <span className="ml-2 text-xs text-text-muted">
                      <code className="font-mono">{k.prefix}…</code> · {k.brand ? k.brand.name : "all brands"} ·{" "}
                      {k.lastUsedAt ? `used ${when.format(k.lastUsedAt)}` : "never used"}
                    </span>
                  </div>
                  <form action={revokeApiKey}>
                    <Back to="/settings" />
                    <input type="hidden" name="keyId" value={k.id} />
                    <button type="submit" className="text-xs text-text-muted underline hover:text-critical">
                      Revoke
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          <form action={createApiKey} className="grid grid-cols-2 gap-3">
            <Back to="/settings" />
            <Field label="Bot name">
              <input name="name" required placeholder="Sales bot" className={inputClass} />
            </Field>
            <Field label="Can read">
              <select name="brandId" className={inputClass}>
                <option value="">All brands</option>
                {ctx.brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} only
                  </option>
                ))}
              </select>
            </Field>
            <div className="col-span-2">
              <Button>Create key</Button>
            </div>
          </form>
          <div className="mt-4 space-y-1 border-t border-border pt-3 text-xs text-text-muted">
            <div>
              Send the key as <code className="font-mono">Authorization: Bearer &lt;key&gt;</code> to:
            </div>
            <code className="block font-mono break-all">{origin}/api/bot/v1/summary?brand=all&amp;range=today</code>
            <code className="block font-mono break-all">{origin}/api/bot/v1/orders?brand=all&amp;range=7d&amp;status=RETURNED</code>
            <code className="block font-mono break-all">{origin}/api/bot/v1/stock?brand=all&amp;low=1</code>
          </div>
        </Card>

        <Card flush title="Recent order updates received" subtitle="The last 15 webhook deliveries, newest first">
          {events.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-text-faint">Nothing received yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px]">
                <thead className={tableHead}>
                  <tr>
                    <th className={th}>When</th>
                    <th className={th}>Channel</th>
                    <th className={th}>Result</th>
                  </tr>
                </thead>
                <tbody className={tableBody}>
                  {events.map((e) => (
                    <tr key={e.id} className="align-top">
                      <td className={`${td} whitespace-nowrap text-text-muted`}>{when.format(e.receivedAt)}</td>
                      <td className={td}>{e.connection.label}</td>
                      <td className={td}>
                        <Pill tone={EVENT_TONE[e.status] ?? "neutral"}>{e.status.toLowerCase()}</Pill>
                        <div className={cn("mt-0.5 text-xs text-text-faint")}>{e.note}</div>
                      </td>
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
