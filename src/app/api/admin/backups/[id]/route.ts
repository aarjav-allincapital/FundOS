import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertAdminUser } from "@/lib/audit/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Download one backup's full snapshot as JSON. Admin-only. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;
  const { data, error } = await sb
    .from("state_backups")
    .select("id, created_at, reason, actor_email, counts, snapshot")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "Backup not found" }, { status: 404 });
  }

  const filename = `fundos-backup-${data.created_at}.json`;
  return new NextResponse(JSON.stringify(data.snapshot, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
