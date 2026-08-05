/**
 * Branded invitation email for the Admin portal user-invite flow.
 * Matches the LP report email shell (logo header, red accent, FundOS footer).
 */

import { EMAIL_BRAND, displayNameFromEmail, escapeHtml } from "@/lib/email/brand";

export interface InviteEmailContent {
  to: string;
  invitedBy: string;
  role: "admin" | "org_user";
  appUrl: string;
}

const ROLE_LABEL: Record<InviteEmailContent["role"], string> = {
  admin: "Admin",
  org_user: "Org user",
};

function emailShell(body: string): string {
  const b = EMAIL_BRAND;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>You're invited to ${escapeHtml(b.product)}</title>
</head>
<body style="margin:0;background:${b.subtle};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:28px 16px 40px;">
    <div style="background:#fff;border:1px solid ${b.line};border-radius:14px;overflow:hidden;">
      <div style="background:#ffffff;border-top:4px solid ${b.red};padding:24px 28px 20px;text-align:center;">
        <img src="${escapeHtml(b.logoUrl)}" alt="${escapeHtml(b.name)}" width="88" height="auto" style="width:88px;height:auto;display:inline-block;border:0;outline:none;" />
      </div>
      ${body}
      <div style="padding:18px 28px 22px;border-top:1px solid ${b.line};background:${b.subtle};">
        <p style="margin:0 0 4px;font-size:11px;color:${b.faint};line-height:1.5;">
          ${escapeHtml(b.name)} · ${escapeHtml(b.product)} — internal use only
        </p>
        <p style="margin:0;font-size:11px;color:${b.faint};line-height:1.5;">
          If you weren't expecting this invitation, you can safely ignore this email.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function buildInviteEmailHtml(opts: InviteEmailContent): string {
  const loginUrl = `${opts.appUrl.replace(/\/$/, "")}/login`;
  const invitee = displayNameFromEmail(opts.to);
  const inviter = displayNameFromEmail(opts.invitedBy);
  const roleLabel = ROLE_LABEL[opts.role];
  const b = EMAIL_BRAND;

  const body = `
      <div style="padding:26px 28px 8px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:${b.faint};margin-bottom:6px;">
          Team invitation
        </div>
        <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:${b.ink};line-height:1.25;">
          Welcome to FundOS, ${escapeHtml(invitee)}
        </h1>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.65;color:${b.muted};">
          <strong style="color:${b.ink};">${escapeHtml(inviter)}</strong>
          (${escapeHtml(opts.invitedBy)}) has invited you to join
          <strong style="color:${b.ink};">${escapeHtml(b.name)}'s</strong> venture portfolio operating system
          as an <strong style="color:${b.ink};">${escapeHtml(roleLabel)}</strong>.
        </p>
      </div>

      <div style="margin:0 28px 22px;padding:16px 18px;border:1px solid ${b.line};border-radius:10px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${b.faint};margin-bottom:10px;">
          How to sign in
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="width:28px;vertical-align:top;padding:0 10px 10px 0;">
              <span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:${b.red};color:#fff;font-size:11px;font-weight:700;text-align:center;line-height:22px;">1</span>
            </td>
            <td style="vertical-align:top;padding:0 0 10px;font-size:13px;line-height:1.55;color:${b.ink};">
              Open FundOS and enter your <strong>@allincapital.vc</strong> email address.
            </td>
          </tr>
          <tr>
            <td style="width:28px;vertical-align:top;padding:0 10px 10px 0;">
              <span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:${b.red};color:#fff;font-size:11px;font-weight:700;text-align:center;line-height:22px;">2</span>
            </td>
            <td style="vertical-align:top;padding:0 0 10px;font-size:13px;line-height:1.55;color:${b.ink};">
              Check your inbox for a one-time sign-in code (valid for 10 minutes).
            </td>
          </tr>
          <tr>
            <td style="width:28px;vertical-align:top;padding:0 10px 0 0;">
              <span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:${b.red};color:#fff;font-size:11px;font-weight:700;text-align:center;line-height:22px;">3</span>
            </td>
            <td style="vertical-align:top;padding:0;font-size:13px;line-height:1.55;color:${b.ink};">
              Enter the code — you're in. No password needed.
            </td>
          </tr>
        </table>
      </div>

      <div style="padding:0 28px 28px;text-align:center;">
        <a href="${escapeHtml(loginUrl)}"
           style="display:inline-block;background:${b.red};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;">
          Accept invitation &amp; sign in
        </a>
        <p style="margin:14px 0 0;font-size:12px;color:${b.faint};line-height:1.5;">
          Or copy this link:<br/>
          <a href="${escapeHtml(loginUrl)}" style="color:${b.muted};word-break:break-all;">${escapeHtml(loginUrl)}</a>
        </p>
      </div>`;

  return emailShell(body);
}

export function buildInviteEmailText(opts: InviteEmailContent): string {
  const loginUrl = `${opts.appUrl.replace(/\/$/, "")}/login`;
  const invitee = displayNameFromEmail(opts.to);
  const inviter = displayNameFromEmail(opts.invitedBy);
  const roleLabel = ROLE_LABEL[opts.role];

  return (
    `Welcome to FundOS, ${invitee}\n\n` +
    `${inviter} (${opts.invitedBy}) has invited you to join All In Capital's ` +
    `venture portfolio operating system as an ${roleLabel}.\n\n` +
    `HOW TO SIGN IN\n` +
    `1. Open FundOS and enter your @allincapital.vc email.\n` +
    `2. Check your inbox for a one-time sign-in code (valid 10 minutes).\n` +
    `3. Enter the code — no password needed.\n\n` +
    `Accept invitation: ${loginUrl}\n\n` +
    `—\n` +
    `All In Capital · FundOS — internal use only.\n` +
    `If you weren't expecting this invitation, you can ignore this email.`
  );
}

export function inviteEmailSubject(role: InviteEmailContent["role"]): string {
  return `You're invited to FundOS as ${ROLE_LABEL[role]} · All In Capital`;
}
