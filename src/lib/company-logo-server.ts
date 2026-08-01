import sharp from "sharp";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseUrl } from "@/lib/supabase/config";
import { domainFromWebsite, duckDuckGoFaviconUrl } from "@/lib/company-logo";

const BUCKET = "company-logos";
const LOGO_SIZE = 64;
const WEBP_QUALITY = 78;

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "FundOS-logo-fetch/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 80 ? buf : null;
  } catch {
    return null;
  }
}

async function fetchLogoBuffer(domain: string): Promise<Buffer | null> {
  const sources = [
    duckDuckGoFaviconUrl(domain),
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
    `https://${domain}/favicon.ico`,
  ];

  for (const url of sources) {
    const buf = await fetchBuffer(url);
    if (!buf) continue;
    try {
      await sharp(buf).metadata();
      return buf;
    } catch {
      /* try next source */
    }
  }
  return null;
}

async function compressLogo(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: "none" })
    .resize(LOGO_SIZE, LOGO_SIZE, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toBuffer();
}

async function generateInitialLogo(label: string): Promise<Buffer> {
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
  return compressLogo(Buffer.from(svg));
}

export function publicCompanyLogoUrl(supabaseUrl: string, companyId: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${companyId}.webp`;
}

/**
 * Fetch favicon (DuckDuckGo first), compress to WebP, upload to Supabase storage.
 * Returns the public logo URL, or null when Supabase is not configured.
 */
export async function storeCompanyLogoInSupabase(opts: {
  companyId: string;
  website: string;
  label?: string;
}): Promise<string | null> {
  const supabaseUrl = getSupabaseUrl();
  const admin = getSupabaseAdminClient();
  if (!supabaseUrl || !admin) return null;

  const domain = domainFromWebsite(opts.website);
  if (!domain) return null;

  const raw = await fetchLogoBuffer(domain);
  const webp = raw
    ? await compressLogo(raw)
    : await generateInitialLogo(opts.label ?? domain);

  const path = `${opts.companyId}.webp`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, webp, {
    contentType: "image/webp",
    upsert: true,
    cacheControl: "31536000",
  });
  if (upErr) throw new Error(`Logo upload failed: ${upErr.message}`);

  return publicCompanyLogoUrl(supabaseUrl, opts.companyId);
}
