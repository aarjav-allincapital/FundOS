import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertAdminUser } from "@/lib/audit/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 200;

/** Paginated audit log for the admin dashboard. Admin-only. */
export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const offset = Number(url.searchParams.get("offset") ?? "0") || 0;
  const action = url.searchParams.get("action");

  let query = sb
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (action) query = query.eq("action", action);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: data ?? [], total: count ?? 0 });
}
