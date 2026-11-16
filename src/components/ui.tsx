import * as React from "react";
import { clsx } from "clsx";

// UI primitives, in the B.E.X design language. Server-component friendly; the
// few interactive pieces live in their own "use client" files.

export function cn(...args: Parameters<typeof clsx>) {
  return clsx(...args);
}

export type Tone = "neutral" | "healthy" | "warning" | "critical" | "accent" | "info";

export const toneText: Record<Tone, string> = {
  neutral: "text-text",
  healthy: "text-healthy",
  warning: "text-warning",
  critical: "text-critical",
  accent: "text-accent",
  info: "text-info",
};

// ── Hover help ──────────────────────────────────────────────────────────────

/** A small "i" that explains a number on hover. Pure CSS. */
export function InfoTip({ text, align = "center" }: { text: React.ReactNode; align?: "center" | "left" | "right" }) {
  const pos = align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <span className="group relative ml-1 inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full border border-border-strong align-middle text-[9px] font-normal text-text-faint">
      i
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute top-[calc(100%+6px)] z-50 hidden w-60 rounded-lg border border-border-strong bg-surface px-3 py-2 text-left text-[11px] font-normal normal-case leading-snug tracking-normal text-text-muted shadow-xl group-hover:block",
          pos,
        )}
      >
        {text}
      </span>
    </span>
  );
}

// ── Page header ─────────────────────────────────────────────────────────────

export function PageHeader({
  eyebrow = "CEO Dashboard · Brands, Orders & Money",
  title,
  description,
  actions,
  meta,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Small print under the controls — freshness, the dates shown. */
  meta?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <p className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">{eyebrow}</p>
        <h1 className="font-serif text-[27px] font-medium leading-tight text-text">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-text-muted">{description}</p> : null}
      </div>
      {actions || meta ? (
        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          {meta ? <div className="text-[11px] leading-snug text-text-faint sm:text-right">{meta}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The heading for one section of a page — the newer B.E.X section header: an
 * accent rule on the left, the question it answers, a serif title, and one
 * sentence saying what the numbers count and leave out.
 *
 * `tone="live"` (accent rule) marks a section that follows the date picker;
 * `"structural"` (grey rule) one that reads all history regardless.
 */
export function SectionHeader({
  eyebrow,
  title,
  description,
  right,
  tone = "live",
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description: React.ReactNode;
  right?: React.ReactNode;
  tone?: "live" | "structural";
  className?: string;
}) {
  const live = tone === "live";
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-l-2 pl-3", live ? "border-accent" : "border-border-strong", className)}>
      <div className="min-w-[14rem] flex-1">
        <div className={cn("text-[10.5px] font-semibold uppercase tracking-[0.09em]", live ? "text-accent" : "text-text-muted")}>{eyebrow}</div>
        <h2 className="mt-px font-serif text-xl font-medium tracking-tight text-text">{title}</h2>
        <p className="mt-0.5 max-w-[64ch] text-[12.5px] leading-snug text-text-muted">{description}</p>
      </div>
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </div>
  );
}

/** A section: its header, then its content. */
export function Section({
  eyebrow,
  title,
  description,
  tone,
  right,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description: React.ReactNode;
  tone?: "live" | "structural";
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 space-y-4">
      <SectionHeader eyebrow={eyebrow} title={title} description={description} tone={tone} right={right} />
      {children}
    </section>
  );
}

// ── Cards ───────────────────────────────────────────────────────────────────

export function Card({
  title,
  subtitle,
  action,
  children,
  flush = false,
  className,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  /** No inner padding — for tables that run edge to edge. */
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-border bg-surface shadow-card", className)}>
      {title ? (
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold tracking-tight text-text">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  sub,
  info,
  tone = "neutral",
  emphasis,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  info?: string;
  tone?: Tone;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-xl border border-border bg-surface px-4 py-3.5 shadow-card", emphasis && "ring-1 ring-accent/25", className)}>
      <div className="flex items-center text-xs font-medium text-text-muted">
        {label}
        {info ? <InfoTip text={info} /> : null}
      </div>
      <div className={cn("mt-1.5 text-[26px] font-semibold leading-none tracking-tight tnum", toneText[tone])}>{value}</div>
      {sub ? <div className="mt-1.5 text-xs text-text-faint">{sub}</div> : null}
    </div>
  );
}

export function Empty({ title, children, action }: { title?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface-2/40 px-6 py-10 text-center">
      {title ? <p className="text-sm font-medium text-text">{title}</p> : null}
      {children ? <p className="mx-auto mt-1 max-w-md text-[13px] text-text-muted">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

// ── Status ──────────────────────────────────────────────────────────────────

const pillTone: Record<Tone, string> = {
  critical: "bg-critical-soft text-critical",
  warning: "bg-warning-soft text-warning",
  healthy: "bg-healthy-soft text-healthy",
  accent: "bg-accent-soft text-accent",
  info: "bg-info-soft text-info",
  neutral: "bg-surface-2 text-text-muted",
};

export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", pillTone[tone], className)}>
      {children}
    </span>
  );
}

const alertTone: Record<Tone, string> = {
  critical: "border-critical/40 bg-critical-soft text-critical",
  warning: "border-warning/40 bg-warning-soft text-warning",
  healthy: "border-healthy/40 bg-healthy-soft text-healthy",
  accent: "border-accent/30 bg-accent-soft text-accent",
  info: "border-info/30 bg-info-soft text-info",
  neutral: "border-border bg-surface-2 text-text-muted",
};

export function Alert({ tone = "info", title, children, className }: { tone?: Tone; title?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div role="status" className={cn("rounded-md border px-3.5 py-2.5 text-[13px]", alertTone[tone], className)}>
      {title ? <div className="font-semibold">{title}</div> : null}
      {children ? <div className={cn(title && "mt-0.5", "text-text")}>{children}</div> : null}
    </div>
  );
}

/** The result of the last action, shown once at the top of the page. */
export function Banner({ ok, error }: { ok: string | null; error: string | null }) {
  if (!ok && !error) return null;
  return <Alert tone={error ? "critical" : "healthy"} className="mb-4">{error ?? ok}</Alert>;
}

// ── Buttons and forms ───────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-on-ink hover:opacity-90",
  secondary: "border border-border-strong bg-surface text-text hover:bg-surface-2",
  ghost: "text-text-muted hover:bg-surface-2 hover:text-text",
  danger: "border border-critical/40 bg-surface text-critical hover:bg-critical-soft",
};

export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    size === "sm" ? "h-7 px-2.5" : "h-9 px-3.5",
    buttonVariants[variant],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "submit",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export const inputClass =
  "h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-[13px] text-text placeholder:text-text-faint focus:border-accent focus:outline-none";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-text-muted">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-text-faint">{hint}</span> : null}
    </label>
  );
}

/** Tells the action which page to return to. */
export function Back({ to }: { to: string }) {
  return <input type="hidden" name="back" value={to} />;
}

// ── Tables ──────────────────────────────────────────────────────────────────

export const th = "px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-text-faint whitespace-nowrap";
export const td = "px-4 py-2.5 text-[13px]";
export const tableHead = "border-b border-border bg-surface-2/60";
export const tableBody = "divide-y divide-border";
