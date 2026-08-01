/** Extract a bare hostname from a website URL or domain string. */
export function domainFromWebsite(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

/** DuckDuckGo favicon service — works as a direct img src without CORS issues. */
export function duckDuckGoFaviconUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
}

export function faviconUrlFromWebsite(website: string): string | null {
  const domain = domainFromWebsite(website);
  return domain ? duckDuckGoFaviconUrl(domain) : null;
}
