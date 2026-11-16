"use client";

// The B.E.X date picker: preset rail + two-month calendar. Sets ?from&to.

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/components/ui";

type YMD = { y: number; m: number; d: number };

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (v: YMD) => `${v.y}-${pad(v.m + 1)}-${pad(v.d)}`;
const parse = (s: string | null): YMD | null => {
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) : null;
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
};
const toNum = (v: YMD) => v.y * 10000 + v.m * 100 + v.d;
const eq = (a: YMD | null, b: YMD | null) => !!a && !!b && toNum(a) === toNum(b);
const between = (v: YMD, a: YMD, b: YMD) => {
  const [lo, hi] = toNum(a) <= toNum(b) ? [a, b] : [b, a];
  return toNum(v) >= toNum(lo) && toNum(v) <= toNum(hi);
};

/** "Today" in Manila, whatever the browser's own time zone. */
function manilaToday(): Date {
  const key = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(base: Date, days: number): YMD {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
}
const startOfMonth = (base: Date): YMD => ({ y: base.getFullYear(), m: base.getMonth(), d: 1 });

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function presets(): { label: string; range: () => [YMD, YMD] }[] {
  const now = manilaToday();
  const today = () => addDays(now, 0);
  return [
    { label: "Today", range: () => [today(), today()] },
    { label: "Yesterday", range: () => [addDays(now, -1), addDays(now, -1)] },
    { label: "Last 7 days", range: () => [addDays(now, -6), today()] },
    { label: "Last 30 days", range: () => [addDays(now, -29), today()] },
    { label: "Last 90 days", range: () => [addDays(now, -89), today()] },
    {
      label: "Last month",
      range: () => {
        const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const last = new Date(now.getFullYear(), now.getMonth(), 0);
        return [startOfMonth(first), { y: last.getFullYear(), m: last.getMonth(), d: last.getDate() }];
      },
    },
    { label: "This week to date", range: () => [addDays(now, -now.getDay()), today()] },
    { label: "This month to date", range: () => [startOfMonth(now), today()] },
  ];
}

function monthGrid(year: number, month: number): (YMD & { out: boolean })[] {
  const startDow = new Date(year, month, 1).getDay();
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(year, month, 1 - startDow + i);
    return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), out: d.getMonth() !== month };
  });
}

export function DateRangePicker({ from, to, label }: { from: string; to: string; label: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [a, setA] = useState<YMD | null>(parse(from));
  const [b, setB] = useState<YMD | null>(parse(to));
  const [anchor, setAnchor] = useState(() => {
    const s = parse(from) ?? addDays(manilaToday(), 0);
    return new Date(s.y, s.m - (s.m === manilaToday().getMonth() ? 1 : 0), 1);
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(v: YMD) {
    if (!a || b) {
      setA(v);
      setB(null);
    } else if (toNum(v) < toNum(a)) {
      setB(a);
      setA(v);
    } else setB(v);
  }

  function go(lo: YMD, hi: YMD) {
    const next = new URLSearchParams(params.toString());
    ["range", "ok", "error"].forEach((k) => next.delete(k));
    next.set("from", fmt(lo));
    next.set("to", fmt(hi));
    router.push(`${pathname}?${next.toString()}`);
    setOpen(false);
  }

  function applyPreset(range: [YMD, YMD]) {
    setA(range[0]);
    setB(range[1]);
    go(range[0], range[1]);
  }

  function apply() {
    if (!a) return;
    const e = b ?? a;
    const [lo, hi] = toNum(a) <= toNum(e) ? [a, e] : [e, a];
    go(lo, hi);
  }

  const months = [anchor, new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-[30px] items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-xs font-medium text-text shadow-card hover:bg-surface-2"
      >
        <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px] text-text-faint">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 11h18" />
        </svg>
        {label}
        <span className="text-text-faint">▾</span>
      </button>

      {open ? (
        <div className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+6px)] sm:w-[min(680px,calc(100vw-2rem))]">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <div className={cn("flex-1 rounded-md border px-3 py-2 text-[13px]", !b ? "border-accent" : "border-border-strong")}>
              {a ? fmt(a) : <span className="text-text-faint">Start date</span>}
            </div>
            <span className="text-text-faint">→</span>
            <div className="flex-1 rounded-md border border-border-strong px-3 py-2 text-[13px]">{b ? fmt(b) : <span className="text-text-faint">End date</span>}</div>
          </div>

          <div className="flex flex-col sm:flex-row">
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-1.5 sm:block sm:w-40 sm:border-b-0 sm:border-r">
              {presets().map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.range())}
                  className="block whitespace-nowrap rounded-md px-3 py-2 text-left text-[13px] text-text-muted hover:bg-surface-2 hover:text-text sm:w-full"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="min-w-0 flex-1 p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <button type="button" aria-label="Previous month" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))} className="rounded px-2 text-text-muted hover:bg-surface-2">‹</button>
                <div className="flex flex-1 justify-around text-[13px] font-semibold text-text">
                  <span>{MONTHS[months[0].getMonth()]} {months[0].getFullYear()}</span>
                  <span className="hidden sm:inline">{MONTHS[months[1].getMonth()]} {months[1].getFullYear()}</span>
                </div>
                <button type="button" aria-label="Next month" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))} className="rounded px-2 text-text-muted hover:bg-surface-2">›</button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {months.map((mo, mi) => (
                  <div key={mi} className={mi === 1 ? "hidden sm:block" : ""}>
                    <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-medium text-text-faint">
                      {DOW.map((d) => <span key={d}>{d}</span>)}
                    </div>
                    <div className="grid grid-cols-7 gap-y-0.5 text-center text-[12px]">
                      {monthGrid(mo.getFullYear(), mo.getMonth()).map((c, i) => {
                        const isA = eq(c, a);
                        const isB = eq(c, b);
                        const inRange = a && b && between(c, a, b);
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => pick(c)}
                            className={cn(
                              "mx-auto flex h-7 w-7 items-center justify-center rounded-md",
                              c.out ? "text-text-faint" : "text-text hover:bg-surface-2",
                              inRange && !isA && !isB && "rounded-none bg-accent-soft/60",
                              (isA || isB) && "bg-ink font-semibold text-on-ink hover:bg-ink",
                            )}
                          >
                            {c.d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
            <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-2">Close</button>
            <button type="button" onClick={apply} disabled={!a} className="rounded-md bg-ink px-4 py-1.5 text-xs font-medium text-on-ink hover:opacity-90 disabled:opacity-40">Apply</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
