import { faviconUrlFromWebsite } from "@/lib/company-logo";

/** Upload favicon to Supabase storage; falls back to DuckDuckGo URL locally. */
export async function syncCompanyLogo(
  companyId: string,
  website: string,
  label?: string,
): Promise<string | null> {
  const trimmed = website.trim();
  if (!trimmed) return null;

  try {
    const res = await fetch("/api/company/logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, website: trimmed, label }),
    });
    if (!res.ok) return faviconUrlFromWebsite(trimmed);
    const data = (await res.json()) as { logo_url?: string | null };
    return data.logo_url ?? faviconUrlFromWebsite(trimmed);
  } catch {
    return faviconUrlFromWebsite(trimmed);
  }
}

export function newCompanyId(): string {
  return `co-${crypto.randomUUID().slice(0, 8)}`;
}
