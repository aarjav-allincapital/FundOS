/** Shared All In Capital email branding — inlined styles for Gmail/Outlook. */

export const EMAIL_BRAND = {
  name: "All In Capital",
  product: "FundOS",
  red: "#F0524B",
  ink: "#111827",
  muted: "#6b7280",
  faint: "#9ca3af",
  line: "#e5e7eb",
  subtle: "#f3f4f6",
  logoUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/company-logos/brand/all-in-red.png?v=3`
    : "https://fundos-aic.vercel.app/all-in-logo-red.png",
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "kushal@allincapital.vc" → "Kushal" */
export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const part = local.split(/[._-]/)[0] ?? local;
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
}
