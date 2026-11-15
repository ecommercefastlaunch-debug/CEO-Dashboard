import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSessionToken, SESSION_COOKIE, type Role } from "@/lib/auth";

export async function currentRole(): Promise<Role | null> {
  return readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Server actions are public endpoints; every one of them calls this first. */
export async function requireRole(...allowed: Role[]): Promise<Role> {
  const role = await currentRole();
  if (!role) redirect("/login");
  if (!allowed.includes(role)) throw new Error("You don't have access to do that.");
  return role;
}
