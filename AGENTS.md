<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## This app reports money

- Money is integer centavos. Never a float, never pesos, in storage or in logic.
- An order changes the order book, the warehouse and the ledger through
  `src/lib/orders/apply.ts` only, in one transaction. Do not write to
  `Order`, `StockMovement` or `JournalEntry` from anywhere else.
- Journal entries are written only by `postEntry`, which refuses anything
  unbalanced. History is corrected by posting a new entry, never by editing one.
- Every server action checks the caller's role first (`requireRole`).
- A change that typechecks is not a change that works: run `npm test` with
  `TEST_DATABASE_URL` set, and look at the page as the role that uses it.
