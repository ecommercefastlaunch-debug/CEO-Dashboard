import { describe, expect, it } from "vitest";
import { A } from "@/lib/accounting/accounts";
import { assertBalanced, balancesOf, deltaLines, desiredOrderBalances, transfer } from "@/lib/accounting/postings";

const order = (over: Partial<Parameters<typeof desiredOrderBalances>[0]> = {}) => ({
  status: "DELIVERED",
  excluded: false,
  totalCentavos: 149000,
  courierFeeCentavos: 10000,
  cogsCentavos: 60000,
  ...over,
});

describe("what an order should look like in the ledger", () => {
  it("books nothing until the order is delivered", () => {
    for (const status of ["NEW", "CONFIRMED", "SHIPPED", "RETURNING", "CANCELLED"]) {
      expect(desiredOrderBalances(order({ status }))).toEqual({});
    }
  });

  it("books the sale, the cost and the courier fee on delivery", () => {
    expect(desiredOrderBalances(order())).toEqual({
      [A.RECEIVABLE]: 139000, // the courier remits the total less its fee
      [A.SALES]: -149000,
      [A.COGS]: 60000,
      [A.INVENTORY]: -60000,
      [A.SHIPPING]: 10000,
    });
  });

  it("books only the wasted courier fee on a return", () => {
    expect(desiredOrderBalances(order({ status: "RETURNED" }))).toEqual({
      [A.SHIPPING]: 10000,
      [A.RECEIVABLE]: -10000,
    });
  });

  it("books nothing for an excluded order, whatever its status", () => {
    expect(desiredOrderBalances(order({ excluded: true }))).toEqual({});
  });

  it("always nets to zero", () => {
    for (const status of ["DELIVERED", "RETURNED", "NEW"]) {
      const total = Object.values(desiredOrderBalances(order({ status }))).reduce((a, b) => a + b, 0);
      expect(total).toBe(0);
    }
  });
});

describe("posting only the difference", () => {
  it("posts the whole thing the first time", () => {
    const lines = deltaLines(desiredOrderBalances(order()), {});
    assertBalanced(lines);
    expect(balancesOf(lines)).toEqual(desiredOrderBalances(order()));
  });

  it("posts nothing when the ledger already agrees", () => {
    const desired = desiredOrderBalances(order());
    expect(deltaLines(desired, desired)).toEqual([]);
  });

  it("unwinds a delivered order that comes back", () => {
    const delivered = desiredOrderBalances(order());
    const returned = desiredOrderBalances(order({ status: "RETURNED" }));
    const lines = deltaLines(returned, delivered);
    assertBalanced(lines);
    // Posted so far + the correction = what a returned order should carry.
    const after = balancesOf([...deltaLines(delivered, {}), ...lines]);
    expect(after).toEqual(returned);
  });

  it("corrects an edited amount with one balanced entry", () => {
    const before = desiredOrderBalances(order());
    const after = desiredOrderBalances(order({ totalCentavos: 99000 }));
    const lines = deltaLines(after, before);
    assertBalanced(lines);
    expect(lines).toEqual([
      { accountCode: A.RECEIVABLE, debitCentavos: 0, creditCentavos: 50000 },
      { accountCode: A.SALES, debitCentavos: 50000, creditCentavos: 0 },
    ]);
  });
});

describe("refusing bad entries", () => {
  it("rejects debits that do not equal credits", () => {
    expect(() => assertBalanced([{ accountCode: A.CASH, debitCentavos: 100, creditCentavos: 0 }])).toThrow(/Unbalanced/);
  });
  it("rejects negative lines and two-sided lines", () => {
    expect(() => assertBalanced([{ accountCode: A.CASH, debitCentavos: -1, creditCentavos: 0 }])).toThrow();
    expect(() => assertBalanced([{ accountCode: A.CASH, debitCentavos: 5, creditCentavos: 5 }])).toThrow();
  });
  it("rejects a zero or negative transfer", () => {
    expect(() => transfer(A.CASH, A.EQUITY, 0)).toThrow();
    expect(() => transfer(A.CASH, A.EQUITY, -5)).toThrow();
  });
});
