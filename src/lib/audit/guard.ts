import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminEmail } from "@/lib/audit/admin";

export type AdminGuardResult =
  | { ok: true; email: string }
  | { ok: false; status: number; error: string };

/** Only signed-in admin-allowlisted users may hit /api/admin/*. */
export async function assertAdminUser(): Promise<AdminGuardResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, status: 503, error: "Supabase not configured" };
  }
  const sb = await getSupabaseServerClient();
  if (!sb) return { ok: false, status: 503, error: "Supabase not configured" };
  const {
    data: { user },
  } = await sb.auth.getUser();
  const email = user?.email ?? null;
  if (!email || !isAdminEmail(email)) {
    return { ok: false, status: 403, error: "Admin access required" };
  }
  return { ok: true, email };
}
