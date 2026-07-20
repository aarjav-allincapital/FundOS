/** Public Supabase config (browser-safe). */

export function getSupabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || undefined;
}

export function getSupabaseAnonKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || undefined;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

/**
 * Organisation email domain. Only addresses at this domain may sign in — the
 * whole team shares one live dashboard, so access is gated by domain rather
 * than an allowlist of individual accounts.
 */
export const ALLOWED_EMAIL_DOMAIN = "allincapital.vc";

export function isAllowedOrgEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}
