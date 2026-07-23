import { NextResponse } from "next/server";
import { assertAdmin, inviteAppUser } from "@/lib/rbac/users";
import { canInviteUsers, type AppRole } from "@/lib/rbac/roles";
import { isAllowedOrgEmail } from "@/lib/supabase/config";
import { sendInviteEmail } from "@/lib/email/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Invite an @allincapital.vc teammate (Kushal / Aarjav only). */
export async function POST(request: Request) {
  const auth = await assertAdmin();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!canInviteUsers(auth.email)) {
    return NextResponse.json(
      { ok: false, error: "Only Kushal or Aarjav can invite users." },
      { status: 403 },
    );
  }

  let body: { email?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role: AppRole = body.role === "admin" ? "admin" : "org_user";

  if (!email || !isAllowedOrgEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "Invite must be an @allincapital.vc email." },
      { status: 400 },
    );
  }

  const invited = await inviteAppUser(email, auth.email, role);
  if (!invited.ok) {
    return NextResponse.json({ ok: false, error: invited.error }, { status: 400 });
  }

  // Always send invitees to the production app — never localhost from a
  // local Admin session (Origin would otherwise be http://localhost:3000).
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const originHeader = request.headers.get("origin")?.trim() ?? "";
  const originLooksLocal =
    /localhost|127\.0\.0\.1/i.test(originHeader) ||
    originHeader.startsWith("http://192.") ||
    originHeader.startsWith("http://10.");
  const appUrl =
    (envUrl && !/localhost|127\.0\.0\.1/i.test(envUrl) ? envUrl : null) ||
    (!originLooksLocal && originHeader ? originHeader : null) ||
    "https://fundos-aic.vercel.app";

  const sent = await sendInviteEmail({
    to: email,
    invitedBy: auth.email,
    role: invited.user.role,
    appUrl,
  });

  if (!sent.ok) {
    return NextResponse.json(
      {
        ok: true,
        user: invited.user,
        emailSent: false,
        warning: sent.error,
      },
      { status: 200 },
    );
  }

  return NextResponse.json({
    ok: true,
    user: invited.user,
    emailSent: true,
    emailId: sent.id,
  });
}
