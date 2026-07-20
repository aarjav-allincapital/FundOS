/**
 * Client-side file router: sends a dropped file down the right adapter.
 * CSV/XLSX parse in the browser; PDF/images POST to /api/ingest/extract.
 */

import { parseSpreadsheet } from "@/lib/ingest/parse-spreadsheet";
import { DOCX_MEDIA_TYPE } from "@/lib/ingest/schema";
import type { ExtractedEntities, Provenance } from "@/lib/ingest/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const INGEST_BUCKET = "ingest-uploads";
/** Inline base64 in the request body only when comfortably under Vercel's ~4.5MB cap. */
const INLINE_MAX_BYTES = 3 * 1024 * 1024;
/** Hard ceiling regardless of transport (matches the storage bucket cap). */
const UPLOAD_MAX_BYTES = 15 * 1024 * 1024;

export type IngestResult =
  | { ok: true; entities: ExtractedEntities; method: Provenance["method"] }
  | { ok: false; error: string };

function guessMediaType(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".docx")) return DOCX_MEDIA_TYPE;
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";
  return "";
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function uploadToStorage(
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { ok: false, error: "Storage is unavailable. Please try a file under 3 MB." };
  }

  // Ask the server (service role) for a signed upload URL — no bucket RLS needed.
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  let path: string;
  let token: string;
  try {
    const res = await fetch("/api/ingest/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ext }),
    });
    const json = (await res.json()) as { path?: string; token?: string; error?: string };
    if (!res.ok || !json.path || !json.token) {
      return { ok: false, error: json.error ?? `Could not prepare upload (${res.status}).` };
    }
    path = json.path;
    token = json.token;
  } catch (err) {
    const detail = err instanceof Error ? err.message : "network error";
    return { ok: false, error: `Could not prepare upload (${detail}).` };
  }

  const { error } = await supabase.storage
    .from(INGEST_BUCKET)
    .uploadToSignedUrl(path, token, file);
  if (error) {
    return { ok: false, error: `Upload failed: ${error.message}` };
  }
  return { ok: true, path };
}

export async function ingestFile(file: File): Promise<IngestResult> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv")) {
    return { ok: true, entities: parseSpreadsheet(file.name, await file.text()), method: "spreadsheet" };
  }
  if (/\.(xlsx|xlsm|xls)$/.test(name)) {
    return { ok: true, entities: parseSpreadsheet(file.name, await file.arrayBuffer()), method: "spreadsheet" };
  }

  // .docx often arrives with a blank or generic file.type — trust the extension.
  const mediaType = name.endsWith(".docx") ? DOCX_MEDIA_TYPE : file.type || guessMediaType(name);
  if (mediaType === "application/pdf" || mediaType === DOCX_MEDIA_TYPE || mediaType.startsWith("image/")) {
    if (file.size > UPLOAD_MAX_BYTES) {
      return {
        ok: false,
        error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Keep it under 15 MB, or export to CSV/XLSX for bulk import.`,
      };
    }

    // Small files go inline in the request body; large files upload to Supabase
    // Storage first (bypassing Vercel's ~4.5MB body limit), then the server
    // downloads them for OCR.
    let payload: { fileBase64?: string; storagePath?: string; mediaType: string; filename: string };
    if (file.size <= INLINE_MAX_BYTES) {
      payload = { fileBase64: await fileToBase64(file), mediaType, filename: file.name };
    } else {
      const uploaded = await uploadToStorage(file);
      if (!uploaded.ok) return uploaded;
      payload = { storagePath: uploaded.path, mediaType, filename: file.name };
    }

    try {
      const res = await fetch("/api/ingest/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const raw = await res.text();
      let json: { entities?: ExtractedEntities; error?: string };
      try {
        json = JSON.parse(raw) as { entities?: ExtractedEntities; error?: string };
      } catch {
        return {
          ok: false,
          error: `Extraction failed (${res.status}). ${raw.slice(0, 180) || "Empty response — try a smaller file or sign in again."}`,
        };
      }
      if (!res.ok || !json.entities) {
        return { ok: false, error: json.error ?? `Extraction failed (${res.status})` };
      }
      return { ok: true, entities: json.entities, method: "extraction" };
    } catch (err) {
      const detail = err instanceof Error ? err.message : "network error";
      return {
        ok: false,
        error: `Could not reach the extraction service (${detail}). Check your connection or try a smaller PDF.`,
      };
    }
  }

  return {
    ok: false,
    error: `Unsupported file: ${file.name}. Use CSV/XLSX for bulk import, or PDF/DOCX/image for extraction (export other formats like PPTX to PDF).`,
  };
}
