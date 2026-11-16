# CEO Dashboard

One place to run an e-commerce company with several brands: every order from
Pancake POS (including Webcake landing pages) and Shopify, the warehouse, and
the books — kept in step with each other automatically.

It is one Next.js app on Vercel and one Postgres database on Supabase.

## What it does

| Module | What you get |
|---|---|
| **Overview** | Net profit, sales, ad spend and ROAS, delivered rate, cash, money owed to you, stock value — for all brands or one, for any period. Plus a short "needs attention" list. |
| **Orders** | Every order from every channel in one list. Test or fraud orders can be excluded (and restored). |
| **Warehouse** | Stock per product and warehouse. Receiving, count corrections, transfers. Stock moves by itself when orders ship and return. |
| **Accounting** | A real double-entry ledger behind a plain screen: P&L, where the money is, and one form for ad spend, remittances and expenses. |
| **Settings** | Brands, warehouses, channel connections, and read-only keys for bots. |

There are two sign-ins: the **owner** sees everything; **warehouse staff** see
only the Warehouse page, with no costs or peso values.

## The rules the numbers follow

These are the decisions the whole system rests on. They live in
`src/lib/accounting/postings.ts` and `src/lib/inventory/rules.ts`, and the
tests in `tests/` spell them out case by case.

- **A sale counts when the order is delivered**, not when it is placed. Before
  that, an order changes nothing in the books.
- **Delivered** → sales, cost of goods, and the courier's fee are booked; the
  courier (or payment gateway) now owes you the total less its fee.
- **Returned (RTS)** → no sale; the goods are back on the shelf; the courier's
  fee is still an expense. A delivered order that later comes back is unwound
  automatically.
- **Stock** leaves the shelf when an order ships and comes back when it is
  returned. On-hand is never a number someone overwrites — it is the sum of
  every movement.
- **A product's cost is frozen on each order when it ships**, so changing a
  cost later never rewrites the profit of an old order.
- **Cash only moves when you say so** (Accounting → Record a transaction):
  ad spend, courier remittances, expenses, supplier payments, owner money.
- An order whose SKU is not in your product list still counts as a sale, but
  with no cost — it appears under "needs attention" until the product is
  added, and then catches up by itself.
- All days are Manila days. All money is stored as whole centavos.

This is a management ledger for decisions. It is not BIR bookkeeping: there is
no VAT, no official receipts, no statutory books.

## Where it runs

- **App:** Vercel project `ceo-dashboard`, production address
  https://ceo-dashboard-peach-gamma.vercel.app — region `sin1` (Singapore).
  Every push to `main` deploys.
- **Database:** Supabase project `ceo-dashboard` (`ucendvpymiayrrukdevl`,
  Singapore), reached through the transaction pooler on
  `aws-0-ap-southeast-1.pooler.supabase.com:6543`.
- The app logs in as its own database role, `erp_app`. Row-level security is
  on for every table with a policy for `erp_app` only, so Supabase's public API
  keys (`anon`, `authenticated`) cannot read anything.
- `erp_app` cannot change the schema. Schema changes are applied as the
  `postgres` role (Supabase SQL editor, or a session-pooler `DIRECT_URL` with
  the postgres password), and a new table needs the same RLS policy and grants
  as the others.
- `GET /api/health` answers `{"ok":true}` when the app can reach the database.

## Setting it up from scratch

### 1. Supabase (the database)

1. Create a project at supabase.com. Pick the Singapore region.
2. Project Settings → Database → Connection string. You need two:
   - **Transaction pooler** (port 6543) → `DATABASE_URL`. Add `?pgbouncer=true` to the end.
   - **Session pooler** (port 5432) → `DIRECT_URL`.
3. Create the tables, from your computer:

   ```bash
   cp .env.example .env    # fill in the two connection strings
   npm install
   npm run db:push
   ```

### 2. Vercel (the app)

1. Import this GitHub repository at vercel.com/new.
2. Add these environment variables (see `.env.example`):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Supabase transaction pooler string |
   | `DIRECT_URL` | Supabase session pooler string |
   | `SESSION_SECRET` | 32+ random characters |
   | `ADMIN_PASSWORD` | the owner password |
   | `WAREHOUSE_PASSWORD` | optional — the warehouse staff password |
   | `CRON_SECRET` | any long random string |

3. Deploy. `vercel.json` schedules a nightly job (2:17 AM Manila) that retries
   any order update that failed to apply and re-pulls the last three days from
   every channel that has an API key.

### 3. In the app

1. **Settings → Brands**: add each brand.
2. **Settings → Sales channels**: connect each brand's Pancake shop and/or
   Shopify store. Copy the webhook address shown into the channel:
   - *Pancake POS*: add the webhook address, and add a request header named
     `x-webhook-secret` with the value shown.
   - *Shopify*: Settings → Notifications → Webhooks. Add the address for order
     creation, update, cancellation, fulfillment and payment (JSON). The "API
     secret key" you enter when connecting is the one Shopify signs with.
   - Saving an API key as well lets you press **Pull orders now** to load
     history, and lets the nightly job catch anything a webhook missed.
3. **Warehouse**: add your products — the SKU must match the SKU on orders —
   with their cost, then receive your opening stock.
4. **Accounting**: record the cash already in the business as "Owner put money
   in", so the cash figure starts from the truth.

## Bots

Settings → Bot access creates a key. A key is read-only, can be limited to one
brand, and never returns customer names or phone numbers. Send it as
`Authorization: Bearer <key>`.

| Endpoint | Answers |
|---|---|
| `GET /api/bot/v1/summary?brand=all&range=today` | P&L, orders by status, delivered rate, cash, receivables, stock value, needs-attention list |
| `GET /api/bot/v1/orders?brand=<code>&range=7d&status=RETURNED` | Orders (no customer details) |
| `GET /api/bot/v1/stock?brand=<code>&sku=<text>&low=1` | Stock on hand, cost and value |

`brand` is a brand code from Settings, or `all`. `range` is one of `today`,
`yesterday`, `7d`, `30d`, `mtd`; or pass `from=YYYY-MM-DD&to=YYYY-MM-DD`.
Amounts are pesos.

## Working on it

```bash
npm run dev          # the app, on http://localhost:3000
npm run typecheck
npm run lint
npm test             # rule tests; add TEST_DATABASE_URL to also run the database tests
```

The database tests wipe the database they are pointed at. `TEST_DATABASE_URL`
must be a throwaway Postgres — never the Supabase one.

Where things are:

```
prisma/schema.prisma        every table
src/lib/channels/           Pancake + Shopify: verify, map to one order shape, backfill
src/lib/orders/apply.ts     the one path by which an order changes orders, stock and ledger
src/lib/accounting/         chart of accounts, posting rules, ledger writes
src/lib/inventory/          stock rules, receiving, adjustments, transfers
src/lib/reports.ts          every number shown on a screen or returned to a bot
src/app/(app)/              the screens
src/app/api/                webhooks, the nightly job, the bot API
```

## Not built yet

- Ad spend is typed in; it is not pulled from Meta.
- No per-user accounts — two shared passwords.
- No bins, pick lists or packing stations in the warehouse.
- The Pancake and Shopify mappers are tested against sample payloads, not yet
  against a live shop. The first real orders should be checked against the
  channel — in particular that Pancake amounts arrive in centavos (see the note
  at the top of `src/lib/channels/pancake.ts`).
