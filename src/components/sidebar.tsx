"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";
import { Mark } from "@/components/mark";
import { logout } from "@/app/actions";

type IconKey = "overview" | "brands" | "orders" | "warehouse" | "accounting" | "settings";

interface NavItem {
  href: string;
  label: string;
  icon: IconKey;
  ownerOnly: boolean;
}
interface NavGroup {
  label?: string;
  items: NavItem[];
}
export interface SidebarBrand {
  slug: string;
  name: string;
}

const GROUPS: NavGroup[] = [
  {
    items: [
      { href: "/", label: "Dashboard", icon: "overview", ownerOnly: true },
      { href: "/brands", label: "All brands", icon: "brands", ownerOnly: true },
    ],
  },
  {
    label: "Operate",
    items: [
      { href: "/orders", label: "Orders", icon: "orders", ownerOnly: true },
      { href: "/warehouse", label: "Warehouse", icon: "warehouse", ownerOnly: false },
    ],
  },
  { label: "Finance", items: [{ href: "/accounting", label: "Accounting", icon: "accounting", ownerOnly: true }] },
  { label: "Setup", items: [{ href: "/settings", label: "Settings", icon: "settings", ownerOnly: true }] },
];
const DEFAULT_OPEN_GROUP = "Operate";

// Line icons drawn to match B.E.X's set (stroke = currentColor).
const ICONS: Record<IconKey, React.ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
  brands: <><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><path d="M17 14v6M14 17h6" /></>,
  orders: <><path d="M6 3h12l1 4H5z" /><path d="M5 7h14v12a2 2 0 01-2 2H7a2 2 0 01-2-2z" /><path d="M9 11h6" /></>,
  warehouse: <><path d="M3 10l9-6 9 6v10a1 1 0 01-1 1H4a1 1 0 01-1-1z" /><path d="M7 21v-7h10v7" /><path d="M7 17h10" /></>,
  accounting: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h3M13 11h3M8 15h3M13 15h3" /></>,
  settings: <><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4" /><circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="14" cy="18" r="2" /></>,
};

function Icon({ k }: { k: IconKey }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0">
      {ICONS[k]}
    </svg>
  );
}

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

function useNav(role: "owner" | "warehouse") {
  const pathname = usePathname();
  const brand = useSearchParams().get("brand");
  const suffix = brand ? `?brand=${encodeURIComponent(brand)}` : "";
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => role === "owner" || !i.ownerOnly) })).filter((g) => g.items.length);
  return { pathname, brand, suffix, groups };
}

/**
 * One folder open at a time, and the folder holding the current page always
 * wins — the newer B.E.X sidebar's rule, so "you are here" is never folded away.
 */
function useOpenGroup(groups: NavGroup[], pathname: string) {
  const groupForPath = groups.find((g) => g.label && g.items.some((it) => isActive(pathname, it.href)))?.label ?? null;
  const [chosen, setChosen] = useState<{ label: string | null; on: string } | null>(null);
  // A manual toggle holds until the page changes; then the route decides again.
  const open = chosen && chosen.on === pathname ? chosen.label : (groupForPath ?? DEFAULT_OPEN_GROUP);
  return { open, toggle: (label: string) => setChosen({ label: open === label ? null : label, on: pathname }) };
}

function GroupHeader({ label, open, onClick }: { label: string; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-[7px] text-[13.5px] font-semibold tracking-tight transition-colors",
        open ? "text-text" : "text-text-muted hover:bg-surface/60 hover:text-text",
      )}
    >
      <span className="flex-1 text-left">{label}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn("h-3.5 w-3.5 shrink-0 text-text-faint transition-transform duration-200", open && "rotate-90")}>
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

/** The brand you are looking at, and the switch between brands. */
function BrandSwitcher({ brands, canAdd }: { brands: SidebarBrand[]; canAdd: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("brand");
  const active = brands.find((b) => b.slug === current) ?? null;
  // Switching keeps you on the same page and the same dates; the brand list
  // page itself is brand-less, so a switch from there opens the dashboard.
  const base = pathname === "/brands" ? "/" : pathname;
  const hrefFor = (slug: string | null) => {
    const q = new URLSearchParams();
    if (slug) q.set("brand", slug);
    for (const k of ["from", "to", "range"]) {
      const v = params.get(k);
      if (v) q.set(k, v);
    }
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const row = (href: string, label: string, isActive: boolean) => (
    <Link
      key={href}
      href={href}
      role="menuitem"
      onClick={() => setOpen(false)}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px]",
        isActive ? "bg-accent-soft/40 font-medium text-accent" : "text-text hover:bg-surface-2",
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", isActive ? "bg-accent" : "bg-border-strong")} />
      <span className="truncate">{label}</span>
      {isActive ? <span className="ml-auto text-[10px] text-accent">viewing</span> : null}
    </Link>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left hover:bg-surface-2"
      >
        <span className="truncate text-[11px] text-text-muted">{active ? active.name : brands.length ? "All brands" : "No brands yet"}</span>
        <span className={cn("shrink-0 text-[10px] text-text-faint transition-transform", open && "rotate-90")}>›</span>
      </button>
      {open ? (
        <div role="menu" className="absolute left-0 right-0 z-40 mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-card">
          {row(hrefFor(null), "All brands", !active)}
          {brands.map((b) => row(hrefFor(b.slug), b.name, active?.slug === b.slug))}
          <Link href="/brands" onClick={() => setOpen(false)} className="block border-t border-border px-3 py-2 text-[12px] font-medium text-accent hover:bg-surface-2">
            See all brands side by side
          </Link>
          {canAdd ? (
            <Link href="/brands#add" onClick={() => setOpen(false)} className="block border-t border-border px-3 py-2 text-[12px] font-medium text-accent hover:bg-surface-2">
              + Add a brand
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Head({ role, brands }: { role: "owner" | "warehouse"; brands: SidebarBrand[] }) {
  return (
    <div className="flex items-center gap-2.5 px-2 py-1">
      <Mark className="h-7 w-7 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold leading-tight text-text">CEO Dashboard</div>
        {role === "owner" ? <BrandSwitcher brands={brands} canAdd /> : <div className="truncate px-2 text-[11px] leading-tight text-text-faint">Warehouse</div>}
      </div>
    </div>
  );
}

function NavList({ role, onNavigate }: { role: "owner" | "warehouse"; onNavigate?: () => void }) {
  const { pathname, suffix, groups } = useNav(role);
  const { open, toggle } = useOpenGroup(groups, pathname);

  const link = (it: NavItem) => {
    const active = isActive(pathname, it.href);
    // "All brands" is the one page that is not about a single brand.
    const href = it.href === "/brands" ? it.href : `${it.href}${suffix}`;
    return (
      <Link
        key={it.href}
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-[13px] font-medium leading-tight transition-colors",
          active ? "bg-surface text-text shadow-card" : "text-text-muted hover:bg-surface/70 hover:text-text",
        )}
      >
        <span className={active ? "text-accent" : "text-text-faint"}>
          <Icon k={it.icon} />
        </span>
        {it.label}
      </Link>
    );
  };

  return (
    <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
      {groups.map((g, gi) =>
        g.label ? (
          <div key={gi}>
            <GroupHeader label={g.label} open={open === g.label} onClick={() => toggle(g.label!)} />
            {open === g.label ? <div className="mt-0.5 ml-2.5 space-y-0.5 border-l border-border pl-1.5">{g.items.map(link)}</div> : null}
          </div>
        ) : (
          <div key={gi} className="space-y-0.5 pb-2">
            {g.items.map(link)}
          </div>
        ),
      )}
    </nav>
  );
}

function Footer({ role }: { role: "owner" | "warehouse" }) {
  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-medium text-text">{role === "owner" ? "Owner" : "Warehouse staff"}</div>
          <div className="text-[11px] text-text-faint">{role === "owner" ? "Administrator" : "Warehouse only"}</div>
        </div>
        <form action={logout}>
          <button type="submit" className="h-7 rounded-md px-2.5 text-[13px] font-medium text-text-muted hover:bg-surface-2 hover:text-text">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

/** Desktop: a fixed rail on the left. */
export function Sidebar({ role, brands }: { role: "owner" | "warehouse"; brands: SidebarBrand[] }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-sidebar lg:flex">
      <div className="px-3 py-4">
        <Head role={role} brands={brands} />
      </div>
      <NavList role={role} />
      <Footer role={role} />
    </aside>
  );
}

/** Phone and tablet: a top bar whose menu button opens the same list as a drawer. */
export function MobileNav({ role, brands }: { role: "owner" | "warehouse"; brands: SidebarBrand[] }) {
  // The drawer remembers the page it was opened on, so any navigation closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const { pathname, brand, groups } = useNav(role);
  const open = openOn === pathname;
  const current = groups.flatMap((g) => g.items).find((i) => isActive(pathname, i.href))?.label ?? "CEO Dashboard";
  const brandName = brands.find((b) => b.slug === brand)?.name ?? (role === "owner" ? "All brands" : "Warehouse");

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-sidebar/95 px-3 py-2 backdrop-blur lg:hidden">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpenOn(pathname)}
          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-text-muted hover:bg-surface-2"
        >
          ☰
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold leading-tight text-text">{current}</div>
          <div className="truncate text-[11px] leading-tight text-text-faint">{brandName}</div>
        </div>
      </header>
      {open ? <button type="button" aria-label="Close menu" onClick={() => setOpenOn(null)} className="fixed inset-0 z-40 bg-black/40 lg:hidden" /> : null}
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-sidebar transition-transform lg:hidden", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="px-3 py-4">
          <Head role={role} brands={brands} />
        </div>
        <NavList role={role} onNavigate={() => setOpenOn(null)} />
        <Footer role={role} />
      </aside>
    </>
  );
}
