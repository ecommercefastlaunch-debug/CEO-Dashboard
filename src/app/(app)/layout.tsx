import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MobileNav, Sidebar } from "@/components/sidebar";
import { prisma } from "@/lib/prisma";
import { currentRole } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const role = await currentRole();
  if (!role) redirect("/login");
  const brands = await prisma.brand.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { slug: true, name: true } });
  return (
    <div className="min-h-screen">
      <Suspense fallback={null}>
        <Sidebar role={role} brands={brands} />
        <MobileNav role={role} brands={brands} />
      </Suspense>
      <main className="lg:pl-64">
        <div className="mx-auto max-w-[1280px] px-3 pb-8 pt-4 sm:px-5 lg:px-8 lg:pb-10 lg:pt-6">{children}</div>
      </main>
    </div>
  );
}
