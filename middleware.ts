import { NextResponse, type NextRequest } from "next/server";
import { readSessionToken, sessionCookieName } from "@/lib/auth/session";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/health"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const token = request.cookies.get(sessionCookieName())?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  try {
    const session = await readSessionToken(token);
    const adminOnly = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
    if (adminOnly && session.role !== "admin") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Not allowed." }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    const writerOnly =
      pathname.startsWith("/inspections/new") ||
      pathname.startsWith("/fleet/new") ||
      (pathname.startsWith("/api/inspections") && request.method !== "GET") ||
      (pathname.startsWith("/api/vehicles") && request.method !== "GET") ||
      (pathname.startsWith("/api/market") && request.method !== "GET");
    if (writerOnly && session.role === "buyer") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Not allowed." }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
