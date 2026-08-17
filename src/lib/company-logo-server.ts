import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseUrl } from "@/lib/supabase/config";
import { domainFromWebsite } from "@/lib/company-logo";
import { resolveCompanyLogoWebp } from "@/lib/company-logo-fetch";

const BUCKET = "company-logos";

export function publicCompanyLogoUrl(supabaseUrl: string, companyId: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${companyId}.webp`;
}

export function companyLogoDataUrl(webp: Buffer): string {
  return `data:image/webp;base64,${webp.toString("base64")}`;
}

/**
 * Fetch the real favicon, compress to WebP, upload to Supabase storage.
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

  if (!domainFromWebsite(opts.website)) return null;

  const webp = await resolveCompanyLogoWebp(opts.website, opts.label);
  const path = `${opts.companyId}.webp`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, webp, {
    contentType: "image/webp",
    upsert: true,
    cacheControl: "31536000",
  });
  if (upErr) throw new Error(`Logo upload failed: ${upErr.message}`);

  return publicCompanyLogoUrl(supabaseUrl, opts.companyId);
}
