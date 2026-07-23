import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

async function main() {
  const env = loadEnv();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const sql = readFileSync("supabase/migrations/012_rbac_app_users.sql", "utf8");

  // Prefer RPC if available; otherwise poke via rest by inserting bootstrap rows.
  const { error: rpcErr } = await sb.rpc("exec_sql", { query: sql });
  if (rpcErr) {
    console.log("rpc unavailable, upserting bootstrap admins via REST…", rpcErr.message);
    const rows = [
      { email: "kushal@allincapital.vc", role: "admin", status: "active" },
      { email: "kb@allincapital.vc", role: "admin", status: "active" },
      { email: "aarjav@allincapital.vc", role: "admin", status: "active" },
    ];
    // Create table can't be done via REST — try select first.
    const { error: selErr } = await sb.from("app_users").select("email").limit(1);
    if (selErr) {
      console.error(
        "app_users table missing. Apply supabase/migrations/012_rbac_app_users.sql in the Supabase SQL editor, then re-run.",
      );
      console.error(selErr.message);
      process.exit(1);
    }
    const { error } = await sb.from("app_users").upsert(rows, { onConflict: "email" });
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
  }
  const { data } = await sb.from("app_users").select("email, role, status").order("email");
  console.log("OK", data);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
