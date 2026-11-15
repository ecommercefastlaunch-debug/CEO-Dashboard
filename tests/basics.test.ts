import { describe, expect, it } from "vitest";
import { canAccess, createSessionToken, readSessionToken } from "@/lib/auth";
import { decryptSecret, encryptSecret, safeEqual } from "@/lib/crypto";
import { formatPeso, parsePeso } from "@/lib/money";
import { customRange, phDayKey, resolveRange } from "@/lib/period";

describe("money", () => {
  it("parses what a person types", () => {
    expect(parsePeso("1,490.50")).toBe(149050);
    expect(parsePeso("₱ 1490")).toBe(149000);
    expect(parsePeso("0.1")).toBe(10);
    expect(parsePeso("")).toBeNull();
    expect(parsePeso("abc")).toBeNull();
    expect(parsePeso("1.2.3")).toBeNull();
  });
  it("formats whole pesos", () => {
    expect(formatPeso(149000)).toBe("₱1,490");
  });
});

describe("Manila days", () => {
  it("puts 11pm UTC on the next Manila day", () => {
    expect(phDayKey(new Date("2026-11-14T23:00:00Z"))).toBe("2026-11-15");
  });
  it("starts 'today' at Manila midnight", () => {
    const p = resolveRange("today", new Date("2026-11-15T03:00:00Z"));
    expect(p.from.toISOString()).toBe("2026-11-14T16:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-11-15T16:00:00.000Z");
  });
  it("covers seven whole days for 7d and starts the month on the 1st", () => {
    const now = new Date("2026-11-15T03:00:00Z");
    expect(resolveRange("7d", now).from.toISOString()).toBe("2026-11-08T16:00:00.000Z");
    expect(resolveRange("mtd", now).from.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    const y = resolveRange("yesterday", now);
    expect(y.to.toISOString()).toBe("2026-11-14T16:00:00.000Z");
  });
  it("accepts a custom range and rejects nonsense", () => {
    expect(customRange("2026-11-01", "2026-11-01")!.to.toISOString()).toBe("2026-11-01T16:00:00.000Z");
    expect(customRange("2026-11-05", "2026-11-01")).toBeNull();
    expect(customRange("yesterday", "2026-11-01")).toBeNull();
  });
});

describe("secrets and sessions", () => {
  it("round-trips an encrypted secret and rejects a tampered one", () => {
    const blob = encryptSecret("pancake-api-key");
    expect(blob).not.toContain("pancake-api-key");
    expect(decryptSecret(blob)).toBe("pancake-api-key");
    const parts = blob.split(":");
    parts[2] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });
  it("compares secrets without accepting blanks", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual(null, "abc")).toBe(false);
    expect(safeEqual("abc", "")).toBe(false);
    expect(safeEqual(undefined, undefined)).toBe(false);
  });
  it("accepts its own session token and nothing else", async () => {
    const token = await createSessionToken("owner", 1_000);
    expect(await readSessionToken(token, 2_000)).toBe("owner");
    expect(await readSessionToken(token.replace("owner", "warehouse"), 2_000)).toBeNull();
    expect(await readSessionToken(token.slice(0, -1) + (token.endsWith("0") ? "1" : "0"), 2_000)).toBeNull();
    expect(await readSessionToken(token, 1_000 + 31 * 24 * 60 * 60 * 1000)).toBeNull();
    expect(await readSessionToken("garbage")).toBeNull();
    expect(await readSessionToken(undefined)).toBeNull();
  });
  it("keeps warehouse staff inside the warehouse", () => {
    expect(canAccess("warehouse", "/warehouse")).toBe(true);
    expect(canAccess("warehouse", "/")).toBe(false);
    expect(canAccess("warehouse", "/accounting")).toBe(false);
    expect(canAccess("warehouse", "/warehouse-secrets")).toBe(false);
    expect(canAccess("owner", "/accounting")).toBe(true);
  });
});
