/**
 * Upload manually provided logo files for specific companies.
 * Usage: npx tsx scripts/upload-manual-logos.mts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "company-logos";
const LOGO_SIZE = 64;
const WEBP_QUALITY = 78;

const ASSET_ROOT =
  "C:/Users/hp/.cursor/projects/c-Users-hp-Desktop-FundOS/assets";

const MANUAL_LOGOS: { id: string; label: string; file: string; darkBg?: boolean }[] = [
  {
    id: "co-ipp",
    label: "&Done",
    darkBg: true,
    file: `${ASSET_ROOT}/c__Users_hp_AppData_Roaming_Cursor_User_workspaceStorage_34702115134a69cdb4fe2c4e88a83873_images_image-4b853ab0-c6f9-4b6d-9b5b-c7867525f6b3.png`,
  },
  {
    id: "co-oftp",
    label: "Returns",
    file: `${ASSET_ROOT}/c__Users_hp_AppData_Roaming_Cursor_User_workspaceStorage_34702115134a69cdb4fe2c4e88a83873_images_image-0eda6fe5-0607-4d8e-bf8c-4f0a0ce4e273.png`,
  },
  {
    id: "co-btp",
    label: "SuperLiving",
    file: `${ASSET_ROOT}/c__Users_hp_AppData_Roaming_Cursor_User_workspaceStorage_34702115134a69cdb4fe2c4e88a83873_images_image-25681999-f0ec-4016-a6dd-aa2054280fde.png`,
  },
  {
    id: "co-sgp",
    label: "Spill Games",
    file: `${ASSET_ROOT}/c__Users_hp_AppData_Roaming_Cursor_User_workspaceStorage_34702115134a69cdb4fe2c4e88a83873_images_image-34d36f6b-07c5-4050-844f-79863cc761f1.png`,
  },
];

function loadEnv() {
  const text = readFileSync(".env.local", "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim();
  }
}

async function compress(input: Buffer, opts?: { darkBg?: boolean }): Promise<Buffer> {
  const bg = opts?.darkBg
    ? { r: 10, g: 10, b: 10, alpha: 1 }
    : { r: 255, g: 255, b: 255, alpha: 0 };
  const size = opts?.darkBg ? 128 : LOGO_SIZE;

  let pipeline = sharp(input, { failOn: "none" }).flatten({ background: bg });

  // Wordmarks (e.g. &Done): trim padding, keep black field so white type stays legible.
  if (opts?.darkBg) {
    pipeline = pipeline.trim({ threshold: 15 });
  }

  return pipeline
    .resize(size, size, {
      fit: "contain",
      background: bg,
    })
    .webp({ quality: opts?.darkBg ? 90 : WEBP_QUALITY, effort: 4 })
    .toBuffer();
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key, { auth: { persistSession: false } });

  for (const logo of MANUAL_LOGOS) {
    console.log(`→ ${logo.label} (${logo.id})`);
    const raw = readFileSync(logo.file);
    const webp = await compress(raw, { darkBg: logo.darkBg });
    const path = `${logo.id}.webp`;

    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, webp, {
      contentType: "image/webp",
      upsert: true,
      cacheControl: "31536000",
    });
    if (upErr) throw new Error(`${logo.id}: ${upErr.message}`);

    const logoUrl = `${url}/storage/v1/object/public/${BUCKET}/${path}`;
    const now = new Date().toISOString();
    const { error: updErr } = await sb
      .from("companies")
      .update({ logo_url: logoUrl, updated_at: now })
      .eq("id", logo.id);
    if (updErr) throw updErr;

    console.log(`  ✓ ${webp.length} bytes → ${logoUrl}`);
  }
  console.log("Done.");
  await sb
    .from("sync_state")
    .upsert({ id: "singleton", updated_at: new Date().toISOString() }, { onConflict: "id" });
  console.log("Bumped sync_state so browsers pull fresh data.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
