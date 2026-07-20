// One-off: create the private ingest-uploads bucket via the service role.
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase URL or service role key");

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await supabase.storage.createBucket("ingest-uploads", {
  public: false,
  fileSizeLimit: 20 * 1024 * 1024,
  allowedMimeTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
  ],
});

if (error && !/already exists/i.test(error.message)) {
  console.error("Failed:", error.message);
  process.exit(1);
}
console.log(error ? `Bucket already exists (ok): ${error.message}` : `Created bucket: ${data?.name}`);
