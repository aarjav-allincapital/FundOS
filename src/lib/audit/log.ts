import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FundOSData } from "@/lib/types";

/**
 * Audit trail + automatic pre-write backups (see migration 010).
 *
 * Important: admin audit_log rows and state_backups are ONLY written when the
 * incoming snapshot actually differs from what's already in the DB. Identical /
 * no-op saves (e.g. FX refresh that didn't change rates, or a debounced save of
 * the same data) must not spam either table — otherwise they fill the free-plan
 * database. Blocked / denied / errored writes are always logged.
 *
 * This is independent of portfolio position_snapshots ("Snapshots & Logs").
 */

const MAX_BACKUPS = 50;
const MAX_AUDIT_ROWS = 500;

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

/**
 * Cheap change detector for admin logging / backup gating. Compares row counts
 * first, then a stable JSON fingerprint of the countable tables. Ignores
 * unrelated keys that may appear on the client payload.
 */
export function hasDataChanged(
  before: FundOSData | null,
  after: FundOSData,
): boolean {
  if (!before) return true;
  const beforeCounts = countsOf(before);
  const afterCounts = countsOf(after);
  for (const key of COUNTABLE_KEYS) {
    if (beforeCounts[key] !== afterCounts[key]) return true;
  }
  for (const key of COUNTABLE_KEYS) {
    if (stableFingerprint(before[key]) !== stableFingerprint(after[key])) {
      return true;
    }
  }
  return false;
}

function stableFingerprint(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.keys(v as object)
          .sort()
          .reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = (v as Record<string, unknown>)[key];
            return acc;
          }, {})
      : v,
  );
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
    await pruneOldAuditRows(sb);
  } catch (err) {
    console.warn("[FundOS] audit log insert failed:", err);
  }
}

/** Keep only the most recent MAX_AUDIT_ROWS so the free-plan DB stays bounded. */
async function pruneOldAuditRows(sb: SupabaseClient): Promise<void> {
  const { data: rows } = await sb
    .from("audit_log")
    .select("id")
    .order("created_at", { ascending: false })
    .range(MAX_AUDIT_ROWS, MAX_AUDIT_ROWS + 500);
  const ids = (rows ?? []).map((r) => (r as { id: string }).id);
  if (ids.length > 0) {
    await sb.from("audit_log").delete().in("id", ids);
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
