import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INGEST_BUCKET = "ingest-uploads";

const ALLOWED_EXT = new Set(["pdf", "docx", "png", "jpg", "jpeg", "webp", "gif"]);

/**
 * Mint a short-lived signed upload URL so the browser can push a large file
 * straight into Supabase Storage, bypassing Vercel's ~4.5MB request-body cap.
 * Using a signed URL means we don't need per-user RLS policies on the bucket —
 * only the server (service role) can hand out these URLs.
 */
export async function POST(request: Request) {
  let body: { ext?: string };
  try {
    body = (await request.json()) as { ext?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ext = (body.ext ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json({ error: `Unsupported file extension "${ext}".` }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Storage is not configured on the server." }, { status: 503 });
  }

  const path = `${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage
    .from(INGEST_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json(
      { error: `Could not create upload URL: ${error?.message ?? "unknown error"}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ path: data.path, token: data.token });
}
