import { assertAdmin } from "@/lib/rbac/users";

export type AdminGuardResult =
  | { ok: true; email: string }
  | { ok: false; status: number; error: string };

/** Only signed-in admins may hit /api/admin/*. */
export async function assertAdminUser(): Promise<AdminGuardResult> {
  const auth = await assertAdmin();
  if (!auth.ok) return auth;
  return { ok: true, email: auth.email };
}
