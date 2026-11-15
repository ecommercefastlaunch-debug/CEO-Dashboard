// The chart of accounts. Fixed in code on purpose: this is a management ledger
// for running the business, not a statutory one, and a short fixed list is what
// keeps the reports readable.

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "COGS" | "EXPENSE";

export interface Account {
  code: string;
  name: string;
  type: AccountType;
}

export const ACCOUNTS = [
  { code: "1000", name: "Cash", type: "ASSET" },
  { code: "1100", name: "Receivable from couriers & gateways", type: "ASSET" },
  { code: "1200", name: "Inventory", type: "ASSET" },
  { code: "2000", name: "Payable to suppliers", type: "LIABILITY" },
  { code: "3000", name: "Owner's capital", type: "EQUITY" },
  { code: "4000", name: "Sales", type: "INCOME" },
  { code: "5000", name: "Cost of goods sold", type: "COGS" },
  { code: "6000", name: "Advertising", type: "EXPENSE" },
  { code: "6100", name: "Shipping & courier fees", type: "EXPENSE" },
  { code: "6200", name: "Salaries & commissions", type: "EXPENSE" },
  { code: "6300", name: "Software & tools", type: "EXPENSE" },
  { code: "6400", name: "Rent & utilities", type: "EXPENSE" },
  { code: "6500", name: "Inventory adjustments", type: "EXPENSE" },
  { code: "6900", name: "Other expenses", type: "EXPENSE" },
] as const satisfies readonly Account[];

export type AccountCode = (typeof ACCOUNTS)[number]["code"];

export const A = {
  CASH: "1000",
  RECEIVABLE: "1100",
  INVENTORY: "1200",
  PAYABLE: "2000",
  EQUITY: "3000",
  SALES: "4000",
  COGS: "5000",
  ADVERTISING: "6000",
  SHIPPING: "6100",
  INVENTORY_ADJUSTMENT: "6500",
} as const satisfies Record<string, AccountCode>;

const BY_CODE = new Map<string, Account>(ACCOUNTS.map((a) => [a.code, a]));

export function account(code: string): Account {
  const a = BY_CODE.get(code);
  if (!a) throw new Error(`Unknown account ${code}`);
  return a;
}

export function isAccountCode(code: unknown): code is AccountCode {
  return typeof code === "string" && BY_CODE.has(code);
}

/** Expense accounts a person can pick when recording a payment. */
export const EXPENSE_ACCOUNTS = ACCOUNTS.filter((a) => a.type === "EXPENSE" && a.code !== A.INVENTORY_ADJUSTMENT);
