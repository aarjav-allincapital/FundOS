import { Resend } from "resend";

function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new Resend(key);
}

function getFromAddress(): string {
  return (
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "FundOS <onboarding@resend.dev>"
  );
}

export async function sendOtpEmail(
  email: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResendClient();
  if (!resend) {
    return { ok: false, error: "RESEND_API_KEY is not configured." };
  }

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: email,
    subject: `${code} is your FundOS sign-in code`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280;">All In Capital · FundOS</p>
        <h1 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #111827;">Your sign-in code</h1>
        <p style="margin: 0 0 24px; font-size: 14px; color: #374151; line-height: 1.5;">
          Enter this code to sign in. It expires in 10 minutes.
        </p>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 0.25em; color: #111827;">${code}</span>
        </div>
        <p style="margin: 0; font-size: 12px; color: #9ca3af;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function sendHtmlEmail(opts: {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  from?: string;
}): Promise<
  { ok: true; id: string | null } | { ok: false; error: string }
> {
  const resend = getResendClient();
  if (!resend) {
    return {
      ok: false,
      error:
        "Email delivery is not configured (RESEND_API_KEY missing). Use Copy or Open in email instead.",
    };
  }

  const { data, error } = await resend.emails.send({
    from: opts.from?.trim() || getFromAddress(),
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    ...(opts.text ? { text: opts.text } : {}),
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.id ?? null };
}
