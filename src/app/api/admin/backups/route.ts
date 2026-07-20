import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertAdminUser } from "@/lib/audit/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List backup metadata (no snapshot payload — kept light). Admin-only. */
export async function GET() {
  const auth = await assertAdminUser();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const sb = getSupabaseAdminClient();
  if (!sb) {
    return NextResponse.json(
      { ok: false, error: "Supabase not configured" },
      { status: 503 },
    );
  }

  const { data, error } = await sb
    .from("state_backups")
    .select("id, created_at, reason, actor_email, counts")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: data ?? [] });
}
