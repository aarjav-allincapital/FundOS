import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  BOOTSTRAP_ADMIN_EMAILS,
  resolveRole,
  type AppRole,
} from "@/lib/rbac/roles";

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

function isAdminOnlyPath(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/logs" ||
    pathname.startsWith("/logs/") ||
    pathname === "/ingest" ||
    pathname.startsWith("/ingest/") ||
    pathname === "/reporting" ||
    pathname.startsWith("/reporting/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/") ||
    pathname === "/api/ingest" ||
    pathname.startsWith("/api/ingest/") ||
    pathname === "/api/reporting" ||
    pathname.startsWith("/api/reporting/")
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

  if (isOrgUser && pathname === "/login") {
    return redirectTo("/");
  }

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

  const role: AppRole = resolveRole({
    email,
    appMetadataRole: user?.app_metadata?.role,
    userMetadataRole: user?.user_metadata?.role,
    dbRole: email && (BOOTSTRAP_ADMIN_EMAILS as readonly string[]).includes(email)
      ? "admin"
      : null,
  });
  const isAdmin = role === "admin";

  if (isAdminOnlyPath(pathname) && !isAdmin) {
    if (pathname.startsWith("/api/")) {
      const denied = NextResponse.json(
        { error: "Admin access required." },
        { status: 403 },
      );
      response.cookies.getAll().forEach((cookie) => {
        denied.cookies.set(cookie);
      });
      return denied;
    }
    return redirectTo("/", false);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
