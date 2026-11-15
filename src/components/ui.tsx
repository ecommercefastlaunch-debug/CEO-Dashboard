import Link from "next/link";
import type { PageContext } from "@/lib/page-context";
import { RANGES, RANGE_LABEL } from "@/lib/period";

export function PageTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {hint ? <p className="mt-1 text-sm text-stone-500">{hint}</p> : null}
    </div>
  );
}

/** The result of the last action, shown once at the top of the page. */
export function Banner({ ok, error }: { ok: string | null; error: string | null }) {
  if (!ok && !error) return null;
  return (
    <div
      role="status"
      className={`mb-4 rounded-lg border px-4 py-2.5 text-sm ${
        error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {error ?? ok}
    </div>
  );
}

const pill = (active: boolean) =>
  `rounded-full px-3 py-1 text-sm whitespace-nowrap transition-colors ${
    active ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
  }`;

/** Brand switcher, and optionally the date range. Plain links — no client code. */
export function Filters({ ctx, path, showRange = true }: { ctx: PageContext; path: string; showRange?: boolean }) {
  return (
    <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <nav aria-label="Brand" className="flex gap-1.5 overflow-x-auto pb-1">
        <Link href={ctx.href(path, { brand: null })} className={pill(!ctx.brand)}>
          All brands
        </Link>
        {ctx.brands.map((b) => (
          <Link key={b.id} href={ctx.href(path, { brand: b.slug })} className={pill(ctx.brand?.id === b.id)}>
            {b.name}
          </Link>
        ))}
      </nav>
      {showRange ? (
        <nav aria-label="Date range" className="flex gap-1.5 overflow-x-auto pb-1">
          {RANGES.map((r) => (
            <Link key={r} href={ctx.href(path, { range: r })} className={pill(ctx.range === r)}>
              {RANGE_LABEL[r]}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

export function Card({ title, children, action }: { title?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl bg-white p-5 ring-1 ring-stone-200">
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "plain",
  big = false,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "plain" | "good" | "bad";
  big?: boolean;
}) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-stone-900";
  return (
    <div className="min-w-0 rounded-xl bg-white p-4 ring-1 ring-stone-200 sm:p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className={`num mt-1.5 font-semibold tracking-tight ${color} ${big ? "text-3xl" : "text-2xl"}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-stone-500">{sub}</div> : null}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-stone-500">{children}</p>;
}

// ── Forms ───────────────────────────────────────────────────────────────────

export const inputClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-stone-600">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-stone-400">{hint}</span> : null}
    </label>
  );
}

export function Button({ children, variant = "primary" }: { children: React.ReactNode; variant?: "primary" | "quiet" | "danger" }) {
  const styles = {
    primary: "bg-stone-900 text-white hover:bg-stone-700",
    quiet: "bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100",
    danger: "bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50",
  }[variant];
  return (
    <button type="submit" className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${styles}`}>
      {children}
    </button>
  );
}

/** Tells the action which page to return to. */
export function Back({ to }: { to: string }) {
  return <input type="hidden" name="back" value={to} />;
}

export const th = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-stone-500";
export const td = "px-3 py-2.5 text-sm";
