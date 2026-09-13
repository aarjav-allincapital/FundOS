/**
 * One-off repair for corrupt company logos in the `company-logos` bucket.
 *
 * Old uploads passed a raw Node Buffer to storage.upload(), which coerced the
 * WebP bytes through a UTF-8 string and replaced every non-ASCII byte with
 * EF BF BD. This script downloads each storage-hosted logo, verifies it
 * decodes with sharp, and re-fetches + re-uploads the broken ones through the
 * fixed (Blob) upload path.
 *
 * Run: npx tsx scripts/repair-logos.mts
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import {
  resolveCompanyLogoWebp,
  generateInitialLogoWebp,
} from "@/lib/company-logo-fetch";

// Load .env.local (same pattern as read-state.mts — values may carry literal
// "\n" escape sequences that must be stripped or the API key is malformed).
const envText = readFileSync(".env.local", "utf8");
for (const line of envText.split(/\r?\n/)) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  const key = line.slice(0, i).trim();
  let value = line.slice(i + 1).replace(/\\r|\\n|\r|\n/g, "").trim();
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  process.env[key] = value.replace(/\\r|\\n|\r|\n/g, "").trim();
}

const BUCKET = "company-logos";
const MARKER = `/storage/v1/object/public/${BUCKET}/`;

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function decodes(buf: Buffer): Promise<boolean> {
  try {
    await sharp(buf).raw().toBuffer();
    return true;
  } catch {
    return false;
  }
}

const { data: companies, error } = await sb
  .from("companies")
  .select("id, legal_name, brand_name, website, logo_url");
if (error) throw new Error(`companies: ${error.message}`);

const hosted = (companies ?? []).filter((c) => c.logo_url?.includes(MARKER));
console.log(`${companies?.length ?? 0} companies, ${hosted.length} with storage-hosted logos`);

let ok = 0;
let repaired = 0;
let failed = 0;

for (const c of hosted) {
  const label = c.brand_name ?? c.legal_name;
  const path = c.logo_url!.slice(c.logo_url!.indexOf(MARKER) + MARKER.length).split("?")[0];

  const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(path);
  const buf = blob ? Buffer.from(await blob.arrayBuffer()) : null;

  if (buf && (await decodes(buf))) {
    ok++;
    console.log(`  ok       ${label} (${path}, ${buf.length}B)`);
    continue;
  }

  console.log(
    `  corrupt  ${label} (${path}${dlErr ? `, download error: ${dlErr.message}` : `, ${buf?.length ?? 0}B`}) — repairing…`,
  );

  try {
    const webp = c.website
      ? await resolveCompanyLogoWebp(c.website, label)
      : await generateInitialLogoWebp(label);
    if (!(await decodes(webp))) throw new Error("re-fetched favicon does not decode");

    const body = new Blob([new Uint8Array(webp)], { type: "image/webp" });
    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, body, {
      contentType: "image/webp",
      upsert: true,
      cacheControl: "31536000",
    });
    if (upErr) throw new Error(upErr.message);

    // Confirm the stored object now decodes.
    const { data: check } = await sb.storage.from(BUCKET).download(path);
    const checkBuf = check ? Buffer.from(await check.arrayBuffer()) : null;
    if (!checkBuf || !(await decodes(checkBuf))) {
      throw new Error("re-uploaded object still does not decode");
    }

    repaired++;
    console.log(`  fixed    ${label} (${webp.length}B uploaded, verified)`);
  } catch (e) {
    failed++;
    console.log(`  FAILED   ${label}: ${e instanceof Error ? e.message : e}`);
  }
}

console.log(`\nDone: ${ok} already fine, ${repaired} repaired, ${failed} failed.`);
