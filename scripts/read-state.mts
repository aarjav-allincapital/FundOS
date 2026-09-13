import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { readWriteFundOS } from "./lib/supabase-io";

const t = readFileSync(".env.local", "utf8");
for (const l of t.split(/\r?\n/)) {
  if (!l || l.startsWith("#") || !l.includes("=")) continue;
  const i = l.indexOf("=");
  const k = l.slice(0, i).trim();
  let v = l.slice(i + 1).replace(/\\r|\\n|\r|\n/g, "").trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  process.env[k] = v.replace(/\\r|\\n|\r|\n/g, "").trim();
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const d = await readWriteFundOS.read(sb);
console.log("PROD NOW:", {
  funds: d.funds?.length,
  companies: d.companies?.length,
  lots: d.investmentLots?.length,
  marks: d.valuationMarks?.length,
  snaps: d.positionSnapshots?.length,
  fx: d.fxRates?.length,
  realizations: d.realizations?.length,
});
