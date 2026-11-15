export type Raw = Record<string, unknown>;

export const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v).trim() || null);

export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});

export const arr = (v: unknown): Raw[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Raw[]) : []);

/** A valid Date or null — never an Invalid Date. */
export function date(v: unknown): Date | null {
  if (v == null || v === "") return null;
  const d = new Date(typeof v === "number" ? v : String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Pull utm_* out of a landing URL. Tolerates relative paths and junk. */
export function utmFromUrl(link: string | null): Record<"source" | "medium" | "campaign" | "content", string | null> {
  const empty = { source: null, medium: null, campaign: null, content: null };
  if (!link) return empty;
  try {
    const u = new URL(link, "https://x.invalid");
    const g = (k: string) => str(u.searchParams.get(k));
    return { source: g("utm_source"), medium: g("utm_medium"), campaign: g("utm_campaign"), content: g("utm_content") };
  } catch {
    return empty;
  }
}
