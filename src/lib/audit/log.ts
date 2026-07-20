import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FundOSData } from "@/lib/types";

/**
 * Audit trail + automatic pre-write backups (see migration 010). Every write
 * to /api/state now leaves a paper trail: a snapshot of the DB *before* the
 * overwrite, and a log row describing who wrote what. If a bad write ever
 * happens again, an admin can see exactly when and restore the snapshot taken
 * right before it — instead of manually reconstructing data from memory.
 */

const MAX_BACKUPS = 50;

type Counts = Record<string, number>;

const COUNTABLE_KEYS: (keyof FundOSData)[] = [
  "fundBrands",
  "funds",
  "companies",
  "founders",
  "deals",
  "dealStageHistory",
  "rounds",
  "roundInvestors",
  "termSheets",
  "investmentLots",
  "valuationMarks",
  "positionSnapshots",
  "fxRates",
  "realizations",
  "documents",
];

export function countsOf(data: FundOSData): Counts {
  const counts: Counts = {};
  for (const key of COUNTABLE_KEYS) {
    const value = data[key];
    counts[key] = Array.isArray(value) ? value.length : 0;
  }
  return counts;
}

/** Insert an audit_log row. Never throws — logging must not break the write path. */
export async function recordAudit(
  sb: SupabaseClient,
  entry: {
    actorEmail: string | null;
    action: string;
    status?: "ok" | "blocked" | "denied" | "error";
    beforeCounts?: Counts | null;
    afterCounts?: Counts | null;
    details?: string;
  },
): Promise<void> {
  try {
    await sb.from("audit_log").insert({
      actor_email: entry.actorEmail,
      action: entry.action,
      status: entry.status ?? "ok",
      before_counts: entry.beforeCounts ?? null,
      after_counts: entry.afterCounts ?? null,
      details: entry.details ?? null,
    });
  } catch (err) {
    console.warn("[FundOS] audit log insert failed:", err);
  }
}

/**
 * Snapshot the current DB state before a destructive full-replace write.
 * Best-effort: failure to snapshot never blocks the write, but is logged.
 */
export async function snapshotState(
  sb: SupabaseClient,
  data: FundOSData,
  reason: "pre-write-auto" | "manual" | "pre-restore",
  actorEmail: string | null,
): Promise<void> {
  try {
    await sb.from("state_backups").insert({
      reason,
      actor_email: actorEmail,
      counts: countsOf(data),
      snapshot: data,
    });
    await pruneOldBackups(sb);
  } catch (err) {
    console.warn("[FundOS] state snapshot failed:", err);
  }
}

/** Keep only the most recent MAX_BACKUPS rows to bound storage. */
async function pruneOldBackups(sb: SupabaseClient): Promise<void> {
  const { data: rows } = await sb
    .from("state_backups")
    .select("id")
    .order("created_at", { ascending: false })
    .range(MAX_BACKUPS, MAX_BACKUPS + 200);
  const ids = (rows ?? []).map((r) => (r as { id: string }).id);
  if (ids.length > 0) {
    await sb.from("state_backups").delete().in("id", ids);
  }
}
