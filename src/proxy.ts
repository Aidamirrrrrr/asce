import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/register",
  "/api/auth",
  "/api/telegram",
  "/api/payments",
  "/api/cron",
  "/api/health",
] as const;

const TICKET_VERIFY_PATTERN = /^\/api\/projects\/[^/]+\/tickets\/verify\//;

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") {
    return true;
  }
  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }
  return TICKET_VERIFY_PATTERN.test(pathname);
}

export default auth((request) => {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!request.auth) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.nextUrl);
    if (pathname !== "/") {
      loginUrl.searchParams.set("callbackUrl", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
