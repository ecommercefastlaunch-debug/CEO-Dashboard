import { describe, expect, it } from "vitest";
import { desiredOut, movingAverageCost, stockDelta } from "@/lib/inventory/rules";

const items = [
  { productId: "p1", quantity: 2 },
  { productId: "p1", quantity: 1 },
  { productId: "p2", quantity: 1 },
  { productId: null, quantity: 9 }, // unmatched SKU: moves nothing
];

describe("when an order's units are out of the warehouse", () => {
  it("is out while shipped, delivered or on its way back", () => {
    for (const s of ["SHIPPED", "DELIVERED", "RETURNING"]) expect(desiredOut(s, items)).toEqual({ p1: 3, p2: 1 });
  });
  it("is in the warehouse before shipping, after return, and when cancelled", () => {
    for (const s of ["NEW", "CONFIRMED", "RETURNED", "CANCELLED"]) expect(desiredOut(s, items)).toEqual({});
  });
});

describe("stock movements post only the difference", () => {
  it("ships the units once", () => {
    expect(stockDelta({ p1: 3 }, {})).toEqual([{ productId: "p1", quantity: -3 }]);
    expect(stockDelta({ p1: 3 }, { p1: -3 })).toEqual([]);
  });
  it("brings them back on return", () => {
    expect(stockDelta({}, { p1: -3 })).toEqual([{ productId: "p1", quantity: 3 }]);
  });
  it("handles a quantity edited after shipping", () => {
    expect(stockDelta({ p1: 1 }, { p1: -3 })).toEqual([{ productId: "p1", quantity: 2 }]);
  });
});

describe("moving-average cost", () => {
  it("blends old and new stock by quantity", () => {
    expect(movingAverageCost(10, 30000, 10, 40000)).toBe(35000);
  });
  it("takes the new cost when nothing is on hand", () => {
    expect(movingAverageCost(0, 30000, 5, 42000)).toBe(42000);
  });
  it("ignores an oversold (negative) balance", () => {
    expect(movingAverageCost(-4, 30000, 5, 42000)).toBe(42000);
  });
});
