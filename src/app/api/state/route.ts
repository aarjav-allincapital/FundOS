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

  // Safety net against accidental wipes: the write is a full delete+replace, so
  // an empty/bootstrap payload would erase everything. Refuse to overwrite a
  // populated database with a snapshot that carries no companies and no lots,
  // unless the caller explicitly forces it (?force=1) — e.g. an intentional reset.
  const force = new URL(request.url).searchParams.get("force") === "1";
  const incomingEmpty =
    body.companies.length === 0 &&
    (!Array.isArray(body.investmentLots) || body.investmentLots.length === 0);
  if (incomingEmpty && !force) {
    try {
      const current = await readAllTables(sb);
      if (hasRelationalData(current)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Refused to overwrite existing data with an empty snapshot. Pass ?force=1 to intentionally reset.",
          },
          { status: 409 },
        );
      }
    } catch {
      // If we can't verify current state, err on the safe side and block.
      return NextResponse.json(
        { ok: false, error: "Could not verify existing data; write blocked." },
        { status: 409 },
      );
    }
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
