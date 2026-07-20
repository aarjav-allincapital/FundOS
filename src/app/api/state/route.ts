import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isAllowedOrgEmail, isSupabaseConfigured } from "@/lib/supabase/config";
import {
  bumpSyncTimestamp,
  hasRelationalData,
  readAllTables,
  readSyncTimestamp,
  writeAllTables,
} from "@/lib/data/supabase-tables";
import {
  countsOf,
  findSuspiciousTableWipe,
  hasDataChanged,
  isFxOnlyChange,
  recordAudit,
  snapshotState,
} from "@/lib/audit/log";
import type { FundOSData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Guard writes: when Supabase is configured, only a signed-in org member may
 * persist. In local mode (no Supabase) auth is disabled and writes pass.
 */
async function assertOrgUser(): Promise<
  { ok: true; email: string | null } | { ok: false; status: number }
> {
  if (!isSupabaseConfigured()) return { ok: true, email: null };
  const sb = await getSupabaseServerClient();
  if (!sb) return { ok: true, email: null };
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || !isAllowedOrgEmail(user.email)) {
    return { ok: false, status: 401 };
  }
  return { ok: true, email: user.email ?? null };
}

/** Load the full dataset from the relational tables (service role). */
export async function GET() {
  const sb = getSupabaseAdminClient();
  if (!sb) {
    return NextResponse.json(
      { ok: false, configured: false, data: null, updatedAt: null },
      { status: 200 },
    );
  }

  try {
    const data = await readAllTables(sb);
    const updatedAtMs = await readSyncTimestamp(sb);
    return NextResponse.json({
      ok: true,
      configured: true,
      data: hasRelationalData(data) ? data : null,
      updatedAt: updatedAtMs ? new Date(updatedAtMs).toISOString() : null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        error: err instanceof Error ? err.message : "read failed",
        data: null,
        updatedAt: null,
      },
      { status: 500 },
    );
  }
}

/** Persist the full dataset to the relational tables (service role). */
export async function PUT(request: Request) {
  const auth = await assertOrgUser();
  if (!auth.ok) {
    const sbDenied = getSupabaseAdminClient();
    if (sbDenied) {
      await recordAudit(sbDenied, {
        actorEmail: null,
        action: "state.write",
        status: "denied",
        details: "Rejected: caller is not a signed-in org member.",
      });
    }
    return NextResponse.json(
      { ok: false, error: "Not authorised" },
      { status: auth.status },
    );
  }
  const actorEmail = auth.email;

  const sb = getSupabaseAdminClient();
  if (!sb) {
    return NextResponse.json(
      { ok: false, configured: false, error: "Supabase not configured" },
      { status: 503 },
    );
  }

  let body: FundOSData;
  try {
    body = (await request.json()) as FundOSData;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || !Array.isArray(body.companies)) {
    return NextResponse.json(
      { ok: false, error: "Payload is not a FundOSData snapshot" },
      { status: 400 },
    );
  }

  // Safety net against accidental wipes: the write is a full delete+replace, so
  // an empty/bootstrap payload would erase everything. Refuse to overwrite a
  // populated database with a snapshot that carries no companies, unless the
  // caller explicitly forces it (?force=1) — e.g. an intentional reset.
  const force = new URL(request.url).searchParams.get("force") === "1";
  // A legitimate save always carries companies — the portfolio's anchor entity.
  // The bare bootstrap (fund brand + fund vehicles, zero companies) and any
  // degraded/partial client snapshot have none, so treat "no companies" as an
  // empty payload regardless of what other tables happen to contain.
  const incomingEmpty = body.companies.length === 0;

  // Always read the current state first: it feeds the guards below *and*
  // becomes the pre-write backup, so every replace is recoverable from the
  // admin dashboard even if a guard is ever wrong.
  let current: FundOSData | null = null;
  try {
    current = await readAllTables(sb);
  } catch {
    current = null;
  }

  if (incomingEmpty && !force) {
    if (!current || hasRelationalData(current)) {
      await recordAudit(sb, {
        actorEmail,
        action: "state.write",
        status: "blocked",
        beforeCounts: current ? countsOf(current) : null,
        afterCounts: countsOf(body),
        details: current
          ? "Refused: empty/bootstrap payload would overwrite populated DB."
          : "Refused: could not verify existing data before an empty write.",
      });
      return NextResponse.json(
        {
          ok: false,
          error: current
            ? "Refused to overwrite existing data with an empty snapshot. Pass ?force=1 to intentionally reset."
            : "Could not verify existing data; write blocked.",
        },
        { status: 409 },
      );
    }
  }

  // Safety net against *partial* wipes: a stale client (e.g. a browser tab
  // that hydrated before some tables were populated) can PUT a snapshot where
  // companies/lots are untouched but another core table silently drops to
  // zero. That is never a legitimate edit, so refuse it too unless forced.
  if (!force && current) {
    const wipedTable = findSuspiciousTableWipe(current, body);
    if (wipedTable) {
      await recordAudit(sb, {
        actorEmail,
        action: "state.write",
        status: "blocked",
        beforeCounts: countsOf(current),
        afterCounts: countsOf(body),
        details: `Refused: incoming payload would drop "${wipedTable}" from ${countsOf(current)[wipedTable]} rows to 0. Pass ?force=1 to intentionally clear it.`,
      });
      return NextResponse.json(
        {
          ok: false,
          error: `Refused to overwrite existing "${wipedTable}" data with an empty table. Pass ?force=1 to intentionally clear it.`,
        },
        { status: 409 },
      );
    }
  }

  // No-op saves must not rewrite tables, take backups, or spam the admin audit
  // log — that is how a free-plan DB fills up from background/debounced writes.
  // Portfolio "Snapshots & Logs" (position_snapshots) is unrelated and untouched.
  const changed = force || hasDataChanged(current, body);
  if (!changed) {
    const updatedAtMs = await readSyncTimestamp(sb);
    return NextResponse.json({
      ok: true,
      updatedAt: updatedAtMs
        ? new Date(updatedAtMs).toISOString()
        : new Date().toISOString(),
      noop: true,
    });
  }

  // Live FX refreshes still persist so every browser shares the new rate, but
  // they are not a user edit — skip audit_log + state_backups for those alone.
  const fxOnly = !force && isFxOnlyChange(current, body);

  if (!fxOnly && current && hasRelationalData(current)) {
    await snapshotState(sb, current, "pre-write-auto", actorEmail);
  }

  try {
    await writeAllTables(sb, body);
    const updatedAt = await bumpSyncTimestamp(sb);
    if (!fxOnly) {
      await recordAudit(sb, {
        actorEmail,
        action: "state.write",
        status: "ok",
        beforeCounts: current ? countsOf(current) : null,
        afterCounts: countsOf(body),
        details: force ? "Forced write (?force=1)." : undefined,
      });
    }
    return NextResponse.json({ ok: true, updatedAt });
  } catch (err) {
    await recordAudit(sb, {
      actorEmail,
      action: "state.write",
      status: "error",
      beforeCounts: current ? countsOf(current) : null,
      afterCounts: countsOf(body),
      details: err instanceof Error ? err.message : "write failed",
    });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "write failed" },
      { status: 500 },
    );
  }
}
