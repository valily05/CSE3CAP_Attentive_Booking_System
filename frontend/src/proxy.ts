import { NextResponse, type NextRequest } from "next/server";

// An optimistic check only: signed-out visitors go to sign in first.
// Real authorization happens in the API on every request.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("cc_session")) {
    const url = new URL("/signin", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/bookings", "/schedule", "/hours", "/admin/:path*"],
};
