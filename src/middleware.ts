import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const ALLOWED_DOMAIN = "allincapital.vc";

/** Paths reachable without a session. */
const PUBLIC_PATHS = ["/login", "/auth", "/api/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function middleware(request: NextRequest) {
  // Local-first mode (no Supabase configured): auth is disabled entirely.
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email?.toLowerCase() ?? null;
  const isOrgUser = Boolean(email && email.endsWith(`@${ALLOWED_DOMAIN}`));
  const { pathname } = request.nextUrl;

  // Redirect while carrying over any refreshed auth cookies from `response`,
  // otherwise the rotated session token is dropped and the user is bounced
  // back to /login on the next request (the "logged out again and again" loop).
  const redirectTo = (path: string, withRedirectParam = false) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    if (withRedirectParam && pathname !== "/") {
      url.searchParams.set("redirect", pathname);
    }
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie);
    });
    return redirect;
  };

  // Signed-in org user hitting /login → send to dashboard.
  if (isOrgUser && pathname === "/login") {
    return redirectTo("/");
  }

  // Unauthenticated (or non-org) user on a protected page → send to /login.
  if (!isOrgUser && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      const denied = NextResponse.json(
        { error: "Sign in with your @allincapital.vc email to use this API." },
        { status: 401 },
      );
      response.cookies.getAll().forEach((cookie) => {
        denied.cookies.set(cookie);
      });
      return denied;
    }
    return redirectTo("/login", true);
  }

  return response;
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
