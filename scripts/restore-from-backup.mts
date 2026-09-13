/**
 * Emergency restore: writes a saved JSON snapshot (a state_backups export or a
 * dashboard backup download) back into the relational tables. Run with:
 *   npx tsx scripts/restore-from-backup.mts <path-to-snapshot.json>
 *
 * Safety: the underlying write (scripts/lib/supabase-io.ts) is non-destructive —
 * it upserts every row first and only prunes rows missing from the snapshot
 * AFTER all upserts succeed, so a schema mismatch can never wipe the database.
 * This script additionally refuses to run against an obviously empty snapshot.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { FundOSData } from "@/lib/types";
import { readWriteFundOS } from "./lib/supabase-io";

function loadEnv() {
  const candidates = [".env.local", ".env", ".env.development.local", ".env.production.local"];
  for (const file of candidates) {
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
      // Strip stray line-ending chars — both real CR/LF and literal "\r"/"\n"
      // sequences, which have shown up baked into pulled Vercel env values and
      // silently corrupt the Supabase URL/keys.
      let val = line.slice(i + 1).replace(/\\r|\\n|\r|\n/g, "").trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      val = val.replace(/\\r|\\n|\r|\n/g, "").trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

/** Accept either a bare FundOSData object or one wrapped as {data}/{snapshot}. */
function unwrapSnapshot(raw: unknown): FundOSData {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (obj.data && typeof obj.data === "object") return obj.data as FundOSData;
    if (obj.snapshot && typeof obj.snapshot === "object") return obj.snapshot as FundOSData;
  }
  return raw as FundOSData;
}

function count<T>(arr: T[] | undefined): number {
  return Array.isArray(arr) ? arr.length : 0;
}

async function main() {
  loadEnv();
  const path = process.argv[2];
  if (!path) throw new Error("Usage: tsx scripts/restore-from-backup.mts <snapshot.json>");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Run `vercel env pull .env.local` first, or export them before running.",
    );
  }

  const snapshot = unwrapSnapshot(JSON.parse(readFileSync(path, "utf8")));

  // Normalize known NOT-NULL columns that older backups may carry as null.
  if (Array.isArray(snapshot.companies)) {
    for (const c of snapshot.companies as Array<Record<string, unknown>>) {
      if (c.aliases == null) c.aliases = [];
    }
  }

  const incoming = {
    companies: count(snapshot.companies),
    investmentLots: count(snapshot.investmentLots),
    valuationMarks: count(snapshot.valuationMarks),
    positionSnapshots: count(snapshot.positionSnapshots),
    fxRates: count(snapshot.fxRates),
    realizations: count(snapshot.realizations),
  };
  console.log("Snapshot to restore:", incoming);

  // Refuse to write an obviously empty snapshot — this is exactly how a restore
  // could accidentally wipe good data.
  if (incoming.companies === 0 && incoming.investmentLots === 0) {
    throw new Error(
      "Refusing to restore: snapshot has 0 companies and 0 investment lots. " +
        "Pass a snapshot that actually contains data.",
    );
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const before = await readWriteFundOS.read(sb);
  console.log("Live DB before restore:", {
    companies: count(before.companies),
    investmentLots: count(before.investmentLots),
    valuationMarks: count(before.valuationMarks),
  });

  await readWriteFundOS.write(sb, snapshot);
  await readWriteFundOS.bumpSync(sb);

  const after = await readWriteFundOS.read(sb);
  console.log("Live DB after restore:", {
    companies: count(after.companies),
    investmentLots: count(after.investmentLots),
    valuationMarks: count(after.valuationMarks),
    positionSnapshots: count(after.positionSnapshots),
    fxRates: count(after.fxRates),
  });
  console.log("Restore complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
