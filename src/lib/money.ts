// Money is integer centavos everywhere. These are the only places it is turned
// into or out of something a person reads.

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const pesoExact = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

/** ₱1,490 — whole pesos, for dashboards. */
export function formatPeso(centavos: number): string {
  // Round half away from zero, so −₱1,200.50 and ₱1,200.50 show the same digits.
  return peso.format(Math.sign(centavos) * Math.round(Math.abs(centavos) / 100));
}

/** ₱1,490.50 — exact, for ledgers. */
export function formatPesoExact(centavos: number): string {
  return pesoExact.format(centavos / 100);
}

/** "1,490.50" typed by a person → 149050. Returns null when it isn't a number. */
export function parsePeso(input: string | null | undefined): number | null {
  if (input == null) return null;
  const cleaned = String(input).replace(/[₱,\s]/g, "");
  if (cleaned === "" || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export function percent(part: number, whole: number): string {
  if (!whole) return "—";
  return `${((part / whole) * 100).toFixed(1)}%`;
}
