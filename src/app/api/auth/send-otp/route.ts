import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAllowedOrgEmail } from "@/lib/supabase/config";
import {
  canResendOtp,
  generateOtpCode,
  hashOtp,
  otpExpiresAt,
  resendCooldownRemaining,
} from "@/lib/auth/otp";
import { sendOtpEmail } from "@/lib/email/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !isAllowedOrgEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "Only @allincapital.vc emails are allowed." },
      { status: 403 },
    );
  }

  const { canSignInEmail } = await import("@/lib/rbac/users");
  const allowed = await canSignInEmail(email);
  if (!allowed.ok) {
    return NextResponse.json({ ok: false, error: allowed.error }, { status: 403 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Authentication is not configured." },
      { status: 503 },
    );
  }

  const { data: existing } = await admin
    .from("auth_otps")
    .select("created_at")
    .eq("email", email)
    .maybeSingle();

  if (existing?.created_at && !canResendOtp(existing.created_at)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Please wait before requesting another code.",
        cooldown: resendCooldownRemaining(existing.created_at),
      },
      { status: 429 },
    );
  }

  const code = generateOtpCode();
  const { error: upsertError } = await admin.from("auth_otps").upsert(
    {
      email,
      code_hash: hashOtp(email, code),
      expires_at: otpExpiresAt(),
      created_at: new Date().toISOString(),
    },
    { onConflict: "email" },
  );

  if (upsertError) {
    return NextResponse.json(
      { ok: false, error: upsertError.message },
      { status: 500 },
    );
  }

  const sent = await sendOtpEmail(email, code);
  if (!sent.ok) {
    return NextResponse.json({ ok: false, error: sent.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
