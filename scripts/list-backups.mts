import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const t = readFileSync(".env.local", "utf8");
for (const l of t.split(/\r?\n/)) {
  if (!l || l.startsWith("#") || !l.includes("=")) continue;
  const i = l.indexOf("=");
  const k = l.slice(0, i).trim();
  let v = l.slice(i + 1).replace(/\r/g, "").trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  process.env[k] = v;
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

function counts(snap: any) {
  if (!snap || typeof snap !== "object") return null;
  const s = snap.data && typeof snap.data === "object" ? snap.data : snap;
  return {
    companies: s.companies?.length ?? 0,
    lots: s.investmentLots?.length ?? 0,
    marks: s.valuationMarks?.length ?? 0,
    funds: s.funds?.length ?? 0,
  };
}

const { data, error } = await sb
  .from("state_backups")
  .select("id, reason, created_at, snapshot")
  .order("created_at", { ascending: false })
  .limit(40);

if (error) {
  console.log("state_backups error:", error.message);
} else {
  console.log(`state_backups rows: ${data?.length ?? 0}`);
  for (const row of data ?? []) {
    console.log(
      `${row.created_at}  ${String(row.reason).padEnd(18)}  ${row.id}  ${JSON.stringify(counts(row.snapshot))}`,
    );
  }
}
