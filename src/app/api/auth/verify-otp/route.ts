import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isAllowedOrgEmail } from "@/lib/supabase/config";
import { isOtpExpired, verifyOtpHash } from "@/lib/auth/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { email?: string; code?: string };
  try {
    body = (await request.json()) as { email?: string; code?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const code = body.code?.trim();

  if (!email || !isAllowedOrgEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "Only @allincapital.vc emails are allowed." },
      { status: 403 },
    );
  }
  if (!code || code.length !== 6) {
    return NextResponse.json(
      { ok: false, error: "Enter the 6-digit code from your email." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdminClient();
  const server = await getSupabaseServerClient();
  if (!admin || !server) {
    return NextResponse.json(
      { ok: false, error: "Authentication is not configured." },
      { status: 503 },
    );
  }

  const { data: row, error: fetchError } = await admin
    .from("auth_otps")
    .select("code_hash, expires_at")
    .eq("email", email)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json(
      { ok: false, error: fetchError.message },
      { status: 500 },
    );
  }
  if (!row) {
    return NextResponse.json(
      { ok: false, error: "No code found. Request a new one." },
      { status: 400 },
    );
  }
  if (isOtpExpired(row.expires_at)) {
    await admin.from("auth_otps").delete().eq("email", email);
    return NextResponse.json(
      { ok: false, error: "Code expired. Request a new one." },
      { status: 400 },
    );
  }
  if (!verifyOtpHash(email, code, row.code_hash)) {
    return NextResponse.json(
      { ok: false, error: "Invalid code. Try again." },
      { status: 400 },
    );
  }

  // OTP valid — consume it, ensure user exists, then open a Supabase session.
  await admin.from("auth_otps").delete().eq("email", email);

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (
    createError &&
    !/already|exists|registered/i.test(createError.message)
  ) {
    return NextResponse.json(
      { ok: false, error: createError.message },
      { status: 500 },
    );
  }

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

  if (linkError || !linkData.properties?.hashed_token) {
    return NextResponse.json(
      { ok: false, error: linkError?.message ?? "Could not create session." },
      { status: 500 },
    );
  }

  const { error: sessionError } = await server.auth.verifyOtp({
    type: "email",
    token_hash: linkData.properties.hashed_token,
  });

  if (sessionError) {
    return NextResponse.json(
      { ok: false, error: sessionError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
