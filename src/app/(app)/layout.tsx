import { Suspense } from "react";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions";
import { Nav } from "@/components/nav";
import { currentRole } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const role = await currentRole();
  if (!role) redirect("/login");
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-5">
            <span className="text-sm font-semibold tracking-tight whitespace-nowrap">CEO Dashboard</span>
            <Suspense fallback={null}>
              <Nav role={role} />
            </Suspense>
          </div>
          <form action={logout}>
            <button type="submit" className="text-sm whitespace-nowrap text-stone-500 hover:text-stone-900">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
