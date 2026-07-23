import { NextResponse } from "next/server";
import { assertSignedIn } from "@/lib/rbac/users";
import { canInviteUsers, canManageRoles, hasPermission } from "@/lib/rbac/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current user's role + capability flags. */
export async function GET() {
  const auth = await assertSignedIn();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status },
    );
  }

  return NextResponse.json({
    ok: true,
    email: auth.email,
    role: auth.role,
    isAdmin: auth.role === "admin",
    can: {
      ingest: hasPermission(auth.role, "ingest"),
      reporting: hasPermission(auth.role, "reporting"),
      logs: hasPermission(auth.role, "logs"),
      admin_portal: hasPermission(auth.role, "admin_portal"),
      edit_lots: hasPermission(auth.role, "edit_lots"),
      edit_valuation_marks: hasPermission(auth.role, "edit_valuation_marks"),
      invite_users: canInviteUsers(auth.email),
      manage_roles: canManageRoles(auth.email),
    },
  });
}
