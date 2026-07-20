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
import type { FundOSData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Guard writes: when Supabase is configured, only a signed-in org member may
 * persist. In local mode (no Supabase) auth is disabled and writes pass.
 */
async function assertOrgUser(): Promise<{ ok: true } | { ok: false; status: number }> {
  if (!isSupabaseConfigured()) return { ok: true };
  const sb = await getSupabaseServerClient();
  if (!sb) return { ok: true };
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || !isAllowedOrgEmail(user.email)) {
    return { ok: false, status: 401 };
  }
  return { ok: true };
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
    return NextResponse.json(
      { ok: false, error: "Not authorised" },
      { status: auth.status },
    );
  }

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

  try {
    await writeAllTables(sb, body);
    const updatedAt = await bumpSyncTimestamp(sb);
    return NextResponse.json({ ok: true, updatedAt });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "write failed" },
      { status: 500 },
    );
  }
}
