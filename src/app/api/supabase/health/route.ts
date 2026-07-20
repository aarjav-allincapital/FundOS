import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase URL or anon key not configured." },
      { status: 503 }
    );
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not set on server." },
      { status: 503 }
    );
  }

  const { count, error } = await admin
    .from("fund_brands")
    .select("*", { count: "exact", head: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    fund_brands: count ?? 0,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
}
