import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIES.some((name) => Boolean(request.cookies.get(name)?.value));
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const authenticated = hasSessionCookie(request);

  if (pathname === "/login") {
    return NextResponse.next();
  }

  if (!authenticated) {
    const url = new URL("/login", request.url);
    url.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/dashboard/:path*", "/customers/:path*", "/loans/:path*", "/collections/:path*", "/payments/:path*", "/reports/:path*", "/settings/:path*"],
};
