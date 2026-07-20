/**
 * Fetch, compress, and upload company logos for all portfolio companies.
 *
 * Prerequisites (run in Supabase SQL Editor first):
 *   supabase/migrations/011_company_logos.sql
 *
 * Usage:
 *   npx tsx scripts/fetch-company-logos.mts
 *
 * READ-ONLY against Airtable (website hints). Writes to Supabase storage +
 * companies.logo_url only.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "company-logos";
const LOGO_SIZE = 64;
const WEBP_QUALITY = 78;

/** Company id → best-known domain for logo fetch (Airtable + manual verification). */
const DOMAIN_BY_ID: Record<
  string,
  { domain: string; website?: string; label: string }
> = {
  "co-ipp": {
    label: "&Done",
    domain: "anddone.co",
    website: "https://www.ionicprofessional.com/",
  },
  "co-atp": { label: "Arctan", domain: "arctan.ai" },
  "co-dtp": {
    label: "Defendron",
    domain: "defendrontech.com",
    website: "https://www.defendrontech.com",
  },
  "co-kvp": {
    label: "Krvvy",
    domain: "krvvy.com",
    website: "https://krvvy.com",
  },
  "co-matp": {
    label: "Medmitra",
    domain: "medmitra-ai.com",
    website: "https://www.medmitra-ai.com",
  },
  "co-aep": { label: "Mixar", domain: "mixar.app", website: "https://mixar.app" },
  "co-snp": {
    label: "Momsmade",
    domain: "momsmade.shop",
    website: "https://momsmade.shop/",
  },
  "co-mr": { label: "Mowito", domain: "mowito.ai", website: "https://mowito.ai" },
  "co-nep": { label: "NPrep", domain: "nprep.in", website: "https://nprep.in/" },
  "co-stp": { label: "Plazza", domain: "plazza.in" },
  "co-oftp": { label: "Returns", domain: "optibase.in" },
  "co-sgp": {
    label: "Spill Games",
    domain: "spill.games",
    website: "https://spill.games/",
  },
  "co-btp": { label: "SuperLiving", domain: "superliving.co" },
  "co-ap": {
    label: "Taakat",
    domain: "avyahcorp.com",
    website: "https://avyahcorp.com",
  },
  "co-ctp": {
    label: "Mello",
    domain: "cmpntech.com",
    website: "https://www.cmpntech.com",
  },
  "co-obp": { label: "Cunin", domain: "onaris.com" },
  "co-smtp": { label: "Cherry App", domain: "getcherry.app" },
};

function loadEnv() {
  const text = readFileSync(".env.local", "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

function publicLogoUrl(supabaseUrl: string, companyId: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${companyId}.webp`;
}

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

async function iconFromWebsite(website: string): Promise<Buffer | null> {
  const base = website.startsWith("http") ? website : `https://${website}`;
  try {
    const res = await fetch(base, {
      headers: { "User-Agent": "FundOS-logo-fetch/1.0" },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const origin = new URL(res.url).origin;
    const relMatch = html.match(
      /<link[^>]+rel=["'](?:apple-touch-icon|icon|shortcut icon)["'][^>]*>/gi,
    );
    const hrefs: string[] = [];
    for (const tag of relMatch ?? []) {
      const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
      if (href) hrefs.push(href);
    }
    for (const href of hrefs) {
      const abs = href.startsWith("http")
        ? href
        : href.startsWith("//")
          ? `https:${href}`
          : `${origin}${href.startsWith("/") ? "" : "/"}${href}`;
      const buf = await fetchBuffer(abs);
      if (buf) {
        try {
          await sharp(buf).metadata();
          if (buf.length > 400) return buf;
        } catch {
          /* invalid image at this href */
        }
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

async function fetchLogoSource(
  domain: string,
  website?: string,
): Promise<Buffer | null> {
  if (website) {
    const fromSite = await iconFromWebsite(website);
    if (fromSite) {
      try {
        await sharp(fromSite).metadata();
        return fromSite;
      } catch {
        /* try other sources */
      }
    }
  }

  const sources: (() => Promise<Buffer | null>)[] = [
    async () =>
      fetchBuffer(
        `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
      ),
    async () =>
      fetchBuffer(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`),
    async () => fetchBuffer(`https://${domain}/favicon.ico`),
  ];

  for (const load of sources) {
    const buf = await load();
    if (!buf) continue;
    try {
      await sharp(buf).metadata();
      return buf;
    } catch {
      /* not a decodable image — try next source */
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

/** Fallback when no favicon is available — brand initials on ink background. */
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

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Missing Supabase env in .env.local");

  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Ensure bucket exists (idempotent).
  const { error: bucketErr } = await sb.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 256 * 1024,
    allowedMimeTypes: ["image/webp", "image/png", "image/jpeg"],
  });
  if (bucketErr && !/already exists/i.test(bucketErr.message)) {
    throw new Error(`Bucket: ${bucketErr.message}`);
  }

  const { data: companies, error: readErr } = await sb
    .from("companies")
    .select("id, legal_name, brand_name, website, logo_url")
    .order("id");
  if (readErr) {
    if (/logo_url/i.test(readErr.message)) {
      throw new Error(
        "companies.logo_url column missing — run supabase/migrations/011_company_logos.sql first.",
      );
    }
    throw readErr;
  }

  mkdirSync("scripts/.logo-cache", { recursive: true });

  const sqlLines: string[] = [
    "-- Generated by scripts/fetch-company-logos.mts",
    `-- ${new Date().toISOString()}`,
    "",
  ];
  const results: { id: string; label: string; bytes: number; url: string }[] = [];

  for (const co of companies ?? []) {
    const src = DOMAIN_BY_ID[co.id];
    if (!src) {
      console.warn(`  skip ${co.id}: no domain map`);
      continue;
    }

    const domain =
      co.website?.replace(/^https?:\/\//, "").split("/")[0] || src.domain;
    const website =
      co.website ??
      src.website ??
      (domain ? `https://${domain}` : undefined);

    console.log(`→ ${src.label} (${co.id}) via ${domain}`);
    const raw = await fetchLogoSource(domain, website ?? undefined);
    let webp: Buffer;
    if (raw) {
      webp = await compressLogo(raw);
    } else {
      console.warn(`  ⚠ no favicon — initials fallback`);
      webp = await generateInitialLogo(src.label);
    }
    const path = `${co.id}.webp`;

    writeFileSync(`scripts/.logo-cache/${path}`, webp);

    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(path, webp, {
        contentType: "image/webp",
        upsert: true,
        cacheControl: "31536000",
      });
    if (upErr) throw new Error(`upload ${co.id}: ${upErr.message}`);

    const logoUrl = publicLogoUrl(url, co.id);
    const { error: updErr } = await sb
      .from("companies")
      .update({ logo_url: logoUrl })
      .eq("id", co.id);
    if (updErr) throw updErr;

    sqlLines.push(
      `UPDATE companies SET logo_url = '${logoUrl}' WHERE id = '${co.id}';`,
    );
    results.push({ id: co.id, label: src.label, bytes: webp.length, url: logoUrl });
    console.log(`  ✓ ${webp.length} bytes → ${logoUrl}`);
  }

  writeFileSync("scripts/company-logo-updates.sql", sqlLines.join("\n") + "\n");
  console.log("\nDone:", results.length, "logos uploaded.");
  console.log("SQL replay file: scripts/company-logo-updates.sql");
  for (const r of results) {
    console.log(`  ${r.label}: ${r.bytes} B`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
