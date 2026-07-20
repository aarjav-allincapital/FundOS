import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const FILE =
  "C:/Users/hp/.cursor/projects/c-Users-hp-Desktop-FundOS/assets/c__Users_hp_AppData_Roaming_Cursor_User_workspaceStorage_34702115134a69cdb4fe2c4e88a83873_images_image-6d66b80d-4714-4487-9309-d8f55e0bb732.png";

function loadEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

/**
 * Make near-black / dark pixels transparent so the logo sits cleanly on a white
 * email header. Keep the coral-red banner + white "ALL IN" text.
 */
async function removeDarkBackground(buf: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const px = Buffer.from(data);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    // Near-black / dark gray → transparent
    if (r < 45 && g < 45 && b < 45) {
      px[i + 3] = 0;
    }
  }

  return sharp(px, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .trim({ threshold: 10 })
    .resize({ width: 220, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  const env = loadEnv();
  const src = readFileSync(FILE);
  const meta = await sharp(src).metadata();
  console.log("src", meta.width, meta.height, "alpha", meta.hasAlpha);

  const png = await removeDarkBackground(src);
  const outMeta = await sharp(png).metadata();
  console.log("out", outMeta.width, outMeta.height, "bytes", png.length);

  writeFileSync("public/all-in-logo-red.png", png);

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const res = await sb.storage.from("company-logos").upload("brand/all-in-red.png", png, {
    contentType: "image/png",
    upsert: true,
    cacheControl: "31536000",
  });
  if (res.error) {
    console.error("UPLOAD ERROR", res.error.message);
    process.exit(1);
  }
  console.log("uploaded OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
