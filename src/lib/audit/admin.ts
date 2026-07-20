/**
 * Admin allowlist — a small, explicit set of emails (separate from the
 * `@allincapital.vc` org gate) that may view the audit log and backups, and
 * trigger a restore. Keep this list short and intentional.
 */
export const ADMIN_EMAILS = ["aarjav@allincapital.vc"];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
