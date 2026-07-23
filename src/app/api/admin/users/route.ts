import { NextResponse } from "next/server";
import {
  assertAdmin,
  listAppUsers,
  syncAuthUsersIntoAppUsers,
} from "@/lib/rbac/users";
import { canInviteUsers, canManageRoles } from "@/lib/rbac/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List users (auto-imports anyone already in Supabase Auth). Admin-only. */
export async function GET() {
  const auth = await assertAdmin();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const synced = await syncAuthUsersIntoAppUsers();
  const users = await listAppUsers();
  return NextResponse.json({
    ok: true,
    users,
    synced,
    capabilities: {
      invite: canInviteUsers(auth.email),
      manageRoles: canManageRoles(auth.email),
    },
  });
}
