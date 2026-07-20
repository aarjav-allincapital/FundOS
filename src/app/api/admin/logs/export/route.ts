import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertAdminUser } from "@/lib/audit/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return `"${str.replace(/"/g, '""')}"`;
}

/** Full audit log as a downloadable CSV. Admin-only. */
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
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10000);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const header = [
    "created_at",
    "actor_email",
    "action",
    "status",
    "before_counts",
    "after_counts",
    "details",
  ];
  const lines = [header.join(",")];
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    lines.push(header.map((col) => csvCell(r[col])).join(","));
  }

  const csv = lines.join("\n");
  const filename = `fundos-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
