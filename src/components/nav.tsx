"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview", owner: true },
  { href: "/orders", label: "Orders", owner: true },
  { href: "/warehouse", label: "Warehouse", owner: false },
  { href: "/accounting", label: "Accounting", owner: true },
  { href: "/settings", label: "Settings", owner: true },
];

/** Top navigation. Keeps the selected brand when moving between pages. */
export function Nav({ role }: { role: "owner" | "warehouse" }) {
  const pathname = usePathname();
  const brand = useSearchParams().get("brand");
  const suffix = brand ? `?brand=${encodeURIComponent(brand)}` : "";
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto">
      {LINKS.filter((l) => role === "owner" || !l.owner).map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={`${l.href}${suffix}`}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm whitespace-nowrap ${
              active ? "bg-stone-100 font-medium text-stone-900" : "text-stone-500 hover:text-stone-900"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
