import sharp from "sharp";
import { domainFromWebsite, duckDuckGoFaviconUrl } from "@/lib/company-logo";

const USER_AGENT = "FundOS-logo-fetch/1.0";
const MAX_FAVICON_DIM = 384;
const MIN_FAVICON_DIM = 8;

export async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 80 ? buf : null;
  } catch {
    return null;
  }
}

function resolveHref(href: string, origin: string): string {
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  return `${origin}${href.startsWith("/") ? "" : "/"}${href}`;
}

/** Parse `<link rel="icon">` / apple-touch-icon from a site's HTML. */
export function extractIconHrefs(html: string): string[] {
  const hrefs: string[] = [];
  const tags = html.match(/<link[^>]+>/gi) ?? [];
  for (const tag of tags) {
    if (!/rel=["'][^"']*(?:icon|apple-touch-icon)/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (href && !href.startsWith("data:")) hrefs.push(href);
  }
  return hrefs;
}

async function iconFromWebsite(website: string): Promise<Buffer | null> {
  const base = website.startsWith("http") ? website : `https://${website}`;
  try {
    const res = await fetch(base, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const origin = new URL(res.url).origin;
    for (const href of extractIconHrefs(html)) {
      const buf = await fetchBuffer(resolveHref(href, origin));
      if (buf && (await isValidFaviconBuffer(buf))) return buf;
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Reject DDG placeholders, OG images, and other non-favicon blobs. */
export async function isValidFaviconBuffer(buf: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(buf, { failOn: "none" }).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < MIN_FAVICON_DIM || h < MIN_FAVICON_DIM) return false;
    if (w > MAX_FAVICON_DIM || h > MAX_FAVICON_DIM) return false;
    // DuckDuckGo generic placeholder when no favicon exists.
    if (w === 48 && h === 48 && buf.length < 3_000) return false;
    return true;
  } catch {
    return false;
  }
}

async function tryUrl(url: string): Promise<Buffer | null> {
  const buf = await fetchBuffer(url);
  if (!buf || !(await isValidFaviconBuffer(buf))) return null;
  return buf;
}

/** Best-effort favicon fetch: site HTML → Google → DuckDuckGo → /favicon.ico */
export async function fetchFaviconBuffer(
  website: string,
  domain?: string | null,
): Promise<Buffer | null> {
  const host = domain ?? domainFromWebsite(website);
  if (!host) return null;

  const fromHtml = await iconFromWebsite(website);
  if (fromHtml) return fromHtml;

  const fallbacks = [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`,
    duckDuckGoFaviconUrl(host),
    `https://${host}/favicon.ico`,
  ];

  for (const url of fallbacks) {
    const buf = await tryUrl(url);
    if (buf) return buf;
  }
  return null;
}

export const LOGO_SIZE = 64;
export const WEBP_QUALITY = 78;

export async function compressLogoToWebp(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: "none" })
    .resize(LOGO_SIZE, LOGO_SIZE, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toBuffer();
}

export async function generateInitialLogoWebp(label: string): Promise<Buffer> {
  const letters = label
    .replace(/&/g, "")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const text = letters || "CO";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <rect width="64" height="64" rx="10" fill="#0A0A0A"/>
  <text x="32" y="40" font-family="system-ui,Segoe UI,sans-serif" font-size="22" font-weight="700" fill="#FFFFFF" text-anchor="middle">${text}</text>
</svg>`;
  return compressLogoToWebp(Buffer.from(svg));
}

export async function resolveCompanyLogoWebp(
  website: string,
  label?: string,
): Promise<Buffer> {
  const raw = await fetchFaviconBuffer(website);
  return raw ? compressLogoToWebp(raw) : generateInitialLogoWebp(label ?? website);
}
