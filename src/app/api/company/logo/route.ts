import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isAllowedOrgEmail, isSupabaseConfigured } from "@/lib/supabase/config";
import { storeCompanyLogoInSupabase } from "@/lib/company-logo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LogoRequest {
  companyId?: string;
  website?: string;
  label?: string;
}

async function assertOrgUser(): Promise<
  { ok: true } | { ok: false; status: number; error: string }
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, status: 503, error: "Supabase is not configured." };
  }
  const sb = await getSupabaseServerClient();
  if (!sb) return { ok: false, status: 503, error: "Auth client unavailable." };
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || !isAllowedOrgEmail(user.email)) {
    return { ok: false, status: 401, error: "Sign in required." };
  }
  return { ok: true };
}

/** Fetch favicon and store compressed WebP in Supabase `company-logos` bucket. */
export async function POST(request: Request) {
  const auth = await assertOrgUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: LogoRequest;
  try {
    body = (await request.json()) as LogoRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const companyId = body.companyId?.trim();
  const website = body.website?.trim();
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }
  if (!website) {
    return NextResponse.json({ error: "website is required" }, { status: 400 });
  }

  try {
    const logo_url = await storeCompanyLogoInSupabase({
      companyId,
      website,
      label: body.label?.trim() || undefined,
    });
    if (!logo_url) {
      return NextResponse.json(
        { error: "Could not store logo — Supabase storage unavailable." },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, logo_url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Logo sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
