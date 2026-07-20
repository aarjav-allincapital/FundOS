/**
 * One-off emergency restore: writes a saved JSON snapshot (pulled from
 * state_backups) back into the relational tables. Run with:
 *   npx tsx scripts/restore-from-backup.mts <path-to-snapshot.json>
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { FundOSData } from "@/lib/types";
import { readWriteFundOS } from "./lib/supabase-io";

function loadEnv() {
  const text = readFileSync(".env.local", "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  loadEnv();
  const path = process.argv[2];
  if (!path) throw new Error("Usage: tsx scripts/restore-from-backup.mts <snapshot.json>");
  const snapshot = JSON.parse(readFileSync(path, "utf8")) as FundOSData;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key, { auth: { persistSession: false } });

  console.log("Writing snapshot with counts:", {
    companies: snapshot.companies?.length,
    investmentLots: snapshot.investmentLots?.length,
    valuationMarks: snapshot.valuationMarks?.length,
    positionSnapshots: snapshot.positionSnapshots?.length,
    fxRates: snapshot.fxRates?.length,
  });

  await readWriteFundOS.write(sb, snapshot);
  await readWriteFundOS.bumpSync(sb);
  console.log("Restore complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
