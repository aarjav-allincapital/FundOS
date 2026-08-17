import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isAllowedOrgEmail, isSupabaseConfigured } from "@/lib/supabase/config";
import {
  companyLogoDataUrl,
  storeCompanyLogoInSupabase,
} from "@/lib/company-logo-server";
import { resolveCompanyLogoWebp } from "@/lib/company-logo-fetch";

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
  if (!isSupabaseConfigured()) return { ok: true };
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
  const label = body.label?.trim() || undefined;
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }
  if (!website) {
    return NextResponse.json({ error: "website is required" }, { status: 400 });
  }

  try {
    const logo_url = await storeCompanyLogoInSupabase({ companyId, website, label });
    if (logo_url) {
      return NextResponse.json({ ok: true, logo_url });
    }

    // Local-first mode: persist as inline WebP data URL.
    const webp = await resolveCompanyLogoWebp(website, label);
    return NextResponse.json({ ok: true, logo_url: companyLogoDataUrl(webp) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Logo sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
