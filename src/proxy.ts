import { NextResponse, type NextRequest } from "next/server";
import { canAccess, readSessionToken, SESSION_COOKIE } from "@/lib/auth";

// Everything is private except the sign-in page and the machine endpoints,
// which carry their own credentials (webhook secrets, cron secret, bot keys).
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const role = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    return role ? NextResponse.redirect(new URL(role === "owner" ? "/" : "/warehouse", req.url)) : NextResponse.next();
  }
  if (!role) return NextResponse.redirect(new URL("/login", req.url));
  if (!canAccess(role, pathname)) return NextResponse.redirect(new URL("/warehouse", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/webhooks|api/cron|api/bot|api/health|_next/static|_next/image|favicon.ico).*)"],
};
