import { NextResponse } from "next/server";
import { assertAdmin, setAppUserRole } from "@/lib/rbac/users";
import {
  BOOTSTRAP_ADMIN_EMAILS,
  canManageRoles,
  normalizeEmail,
  type AppRole,
} from "@/lib/rbac/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Change a user's role — Kushal only. */
export async function POST(request: Request) {
  const auth = await assertAdmin();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!canManageRoles(auth.email)) {
    return NextResponse.json(
      { ok: false, error: "Only Kushal can manage roles." },
      { status: 403 },
    );
  }

  let body: { email?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const email = normalizeEmail(typeof body.email === "string" ? body.email : null);
  const role: AppRole | null =
    body.role === "admin" || body.role === "org_user" ? body.role : null;

  if (!email || !role) {
    return NextResponse.json(
      { ok: false, error: "email and role (admin|org_user) are required." },
      { status: 400 },
    );
  }

  // Protect bootstrap admins from accidental demotion of Kushal himself only?
  // User said Kushal manages roles for all — allow demoting others including kb/aarjav,
  // but never demote Kushal (role manager must remain admin).
  if (
    email === "kushal@allincapital.vc" &&
    role !== "admin"
  ) {
    return NextResponse.json(
      { ok: false, error: "Cannot demote the role manager account." },
      { status: 400 },
    );
  }

  // Keep bootstrap list documented but allow role changes for kb/aarjav via Kushal.
  void BOOTSTRAP_ADMIN_EMAILS;

  const result = await setAppUserRole(email, role);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, user: result.user });
}
