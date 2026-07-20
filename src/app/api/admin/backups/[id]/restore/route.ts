import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertAdminUser } from "@/lib/audit/guard";
import { readAllTables, writeAllTables, bumpSyncTimestamp } from "@/lib/data/supabase-tables";
import { countsOf, recordAudit, snapshotState } from "@/lib/audit/log";
import type { FundOSData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Restore the DB to a prior backup snapshot. The *current* state is itself
 * backed up first (reason: pre-restore), so a restore can always be undone.
 * Admin-only.
 */
export async function POST(
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
  const { data: backup, error: readErr } = await sb
    .from("state_backups")
    .select("snapshot")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  }
  if (!backup) {
    return NextResponse.json({ ok: false, error: "Backup not found" }, { status: 404 });
  }

  const snapshot = backup.snapshot as FundOSData;

  try {
    const current = await readAllTables(sb);
    await snapshotState(sb, current, "pre-restore", auth.email);

    await writeAllTables(sb, snapshot);
    const updatedAt = await bumpSyncTimestamp(sb);

    await recordAudit(sb, {
      actorEmail: auth.email,
      action: "backup.restore",
      status: "ok",
      beforeCounts: countsOf(current),
      afterCounts: countsOf(snapshot),
      details: `Restored backup ${id}.`,
    });

    return NextResponse.json({ ok: true, updatedAt });
  } catch (err) {
    await recordAudit(sb, {
      actorEmail: auth.email,
      action: "backup.restore",
      status: "error",
      details: err instanceof Error ? err.message : `Restore of backup ${id} failed.`,
    });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "restore failed" },
      { status: 500 },
    );
  }
}
