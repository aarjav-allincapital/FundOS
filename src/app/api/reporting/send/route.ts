import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/rbac/users";
import { sendHtmlEmail } from "@/lib/email/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 50;

export async function POST(request: Request) {
  const auth = await assertAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status },
    );
  }

  let body: {
    to?: unknown;
    subject?: unknown;
    html?: unknown;
    text?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const toRaw = Array.isArray(body.to) ? body.to : [];
  const to = toRaw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
  const invalid = to.filter((e) => !EMAIL_RE.test(e));

  if (to.length === 0) {
    return NextResponse.json({ ok: false, error: "Add at least one recipient." }, { status: 400 });
  }
  if (invalid.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Invalid email(s): ${invalid.join(", ")}` },
      { status: 400 },
    );
  }
  if (to.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { ok: false, error: `Too many recipients (max ${MAX_RECIPIENTS}).` },
      { status: 400 },
    );
  }
  if (typeof body.subject !== "string" || !body.subject.trim()) {
    return NextResponse.json({ ok: false, error: "Subject is required." }, { status: 400 });
  }
  if (typeof body.html !== "string" || !body.html.trim()) {
    return NextResponse.json({ ok: false, error: "Email content is empty." }, { status: 400 });
  }

  // LP updates always go from team@ — never the OTP/auth sender.
  const result = await sendHtmlEmail({
    to,
    subject: body.subject.trim(),
    html: body.html,
    text: typeof body.text === "string" ? body.text : undefined,
    from:
      process.env.RESEND_LP_FROM_EMAIL?.trim() ||
      "All In Capital <team@allincapital.vc>",
    replyTo: auth.email ?? undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, id: result.id });
}
