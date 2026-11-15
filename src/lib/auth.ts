// Sign-in. Two shared passwords, set as environment variables:
//
//   ADMIN_PASSWORD      → "owner": sees everything.
//   WAREHOUSE_PASSWORD  → "warehouse": sees the warehouse pages only (optional).
//
// The session is a signed cookie (HMAC-SHA256 with SESSION_SECRET) — no session
// table. Written with Web Crypto so the same code runs in the proxy and in
// server components.

export type Role = "owner" | "warehouse";
export const SESSION_COOKIE = "erp_session";
export const SESSION_DAYS = 30;
/** Carries a just-created bot key to the settings page, once. */
export const FLASH_KEY_COOKIE = "erp_new_key";

const enc = new TextEncoder();

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET is missing or too short (16+ characters).");
  return s;
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(role: Role, now: number = Date.now()): Promise<string> {
  const payload = `${role}.${now + SESSION_DAYS * 24 * 60 * 60 * 1000}`;
  return `${payload}.${await sign(payload)}`;
}

export async function readSessionToken(token: string | undefined | null, now: number = Date.now()): Promise<Role | null> {
  if (!token) return null;
  const [role, exp, sig] = token.split(".");
  if (!role || !exp || !sig || (role !== "owner" && role !== "warehouse")) return null;
  if (!(Number(exp) > now)) return null;
  let expected: string;
  try {
    expected = await sign(`${role}.${exp}`);
  } catch {
    return null;
  }
  return sameString(expected, sig) ? role : null;
}

/** Which role a typed password grants, if any. */
export function roleForPassword(password: string): Role | null {
  const admin = process.env.ADMIN_PASSWORD;
  const warehouse = process.env.WAREHOUSE_PASSWORD;
  if (admin && sameString(admin, password)) return "owner";
  if (warehouse && sameString(warehouse, password)) return "warehouse";
  return null;
}

/** Whether a role may open a path. Warehouse staff see only the warehouse. */
export function canAccess(role: Role, pathname: string): boolean {
  if (role === "owner") return true;
  return pathname === "/warehouse" || pathname.startsWith("/warehouse/");
}
