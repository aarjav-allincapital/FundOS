/**
 * READ-ONLY diagnostic for the "all data wiped" incident. Makes NO writes.
 *   npx tsx scripts/diagnose-wipe.mts
 *
 * Confirms, with runtime evidence from Supabase:
 *  - current row counts (is data actually gone?)
 *  - whether valuation_marks has the mark_status / shares columns (migrations
 *    014 / 015 applied?)
 *  - the most recent state.write audit_log rows (the failing write's error)
 *  - the most recent state_backups snapshot (is recovery possible?)
 */
import { readFileSync, appendFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const LOG = "/Users/allincapital/FundOS/.cursor/debug-9c23e3.log";
function dlog(hypothesisId: string, message: string, data: unknown) {
  try {
    appendFileSync(
      LOG,
      JSON.stringify({
        sessionId: "9c23e3",
        runId: "diagnose",
        hypothesisId,
        location: "scripts/diagnose-wipe.mts",
        message,
        data,
        timestamp: Date.now(),
      }) + "\n",
    );
  } catch {
    /* ignore */
  }
}

function loadEnv() {
  for (const file of [".env.local", ".env", ".env.development.local", ".env.production.local"]) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const key = line.slice(0, i).trim();
      const val = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(
      "Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). " +
        "No .env file found in the workspace root.",
    );
    dlog("ENV", "missing supabase env", { hasUrl: !!url, hasKey: !!key });
    return;
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // H3: current row counts — is the data actually gone?
  const tables = [
    "companies",
    "funds",
    "investment_lots",
    "valuation_marks",
    "position_snapshots",
    "realizations",
  ];
  const counts: Record<string, number | string> = {};
  for (const t of tables) {
    const { count, error } = await sb
      .from(t)
      .select("*", { count: "exact", head: true });
    counts[t] = error ? `ERR: ${error.message}` : (count ?? 0);
  }
  console.log("[H3] current row counts:", counts);
  dlog("H3", "current row counts", counts);

  // H1 / H2: do the new columns exist on valuation_marks?
  const colProbe: Record<string, string> = {};
  for (const col of ["mark_status", "shares"]) {
    const { error } = await sb.from("valuation_marks").select(col).limit(1);
    colProbe[col] = error ? `MISSING: ${error.message}` : "present";
  }
  console.log("[H1/H2] valuation_marks column probe:", colProbe);
  dlog("H1H2", "valuation_marks column probe", colProbe);

  // H4: most recent state.write audit rows (esp. the error)
  const { data: audits, error: auditErr } = await sb
    .from("audit_log")
    .select("created_at, actor_email, action, status, before_counts, after_counts, details")
    .order("created_at", { ascending: false })
    .limit(8);
  if (auditErr) {
    console.log("[H4] audit_log read error:", auditErr.message);
    dlog("H4", "audit_log read error", auditErr.message);
  } else {
    console.log("[H4] recent audit_log:", JSON.stringify(audits, null, 2));
    dlog("H4", "recent audit_log", audits);
  }

  // H5: most recent backups — can we recover?
  const { data: backups, error: bkErr } = await sb
    .from("state_backups")
    .select("id, created_at, reason, actor_email, counts")
    .order("created_at", { ascending: false })
    .limit(8);
  if (bkErr) {
    console.log("[H5] state_backups read error:", bkErr.message);
    dlog("H5", "state_backups read error", bkErr.message);
  } else {
    console.log("[H5] recent state_backups:", JSON.stringify(backups, null, 2));
    dlog("H5", "recent state_backups", backups);
  }

  console.log("\nDiagnostic complete (no writes were made).");
}

main().catch((err) => {
  console.error(err);
  dlog("ERR", "diagnostic crashed", String(err));
  process.exit(1);
});
