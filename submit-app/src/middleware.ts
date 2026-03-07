import { NextRequest, NextResponse } from "next/server";

const ADMIN_COOKIE_NAME = "admin_ok";

function notFoundResponse() {
  return new NextResponse("Not Found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname === "/admin" || pathname === "/admin/") {
    return notFoundResponse();
  }

  const expectedSlug = process.env.ADMIN_SLUG_SECRET;
  const expectedBootstrapKey = process.env.ADMIN_BOOTSTRAP_KEY;

  if (!expectedSlug || !expectedBootstrapKey) {
    return notFoundResponse();
  }

  const segments = pathname.split("/").filter(Boolean);
  const slug = segments[1] ?? null;

  if (!slug || slug !== expectedSlug) {
    return notFoundResponse();
  }

  const queryKey = request.nextUrl.searchParams.get("key");
  if (queryKey !== null) {
    if (queryKey !== expectedBootstrapKey) {
      return notFoundResponse();
    }

    const cleanUrl = new URL(request.url);
    cleanUrl.search = "";

    const response = NextResponse.redirect(cleanUrl, 302);
    response.cookies.set({
      name: ADMIN_COOKIE_NAME,
      value: "1",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  }

  const hasAdminCookie = request.cookies.get(ADMIN_COOKIE_NAME)?.value === "1";
  if (!hasAdminCookie) {
    return notFoundResponse();
  }

  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
