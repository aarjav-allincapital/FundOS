/**
 * Client-side file router: sends a dropped file down the right adapter.
 * CSV/XLSX parse in the browser; PDF/images POST to /api/ingest/extract.
 */

import { parseSpreadsheet } from "@/lib/ingest/parse-spreadsheet";
import { DOCX_MEDIA_TYPE } from "@/lib/ingest/schema";
import type { ExtractedEntities, Provenance } from "@/lib/ingest/types";

/** Vercel serverless body cap is ~4.5 MB. Stay under it with a little headroom. */
const VERCEL_BODY_MAX = Math.floor(4.2 * 1024 * 1024);
/** Hard ceiling regardless of transport (matches the storage bucket cap). */
const UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
/** Don't leave the UI spinning — fail the job if OCR hasn't returned. */
const EXTRACT_TIMEOUT_MS = 90_000;

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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function readWithFileReader(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("The browser returned no file data."));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("The browser could not read the file."));
    reader.onabort = () => reject(new Error("File reading was cancelled."));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Materialize the selected file while its browser handle is still valid.
 * Safari and cloud-backed files can intermittently throw an I/O read error;
 * retry once, then use FileReader's separate implementation as a fallback.
 */
async function readFileBytes(file: File): Promise<Uint8Array> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const buffer = await file.arrayBuffer();
      if (file.size > 0 && buffer.byteLength === 0) {
        throw new Error("The browser returned an empty file.");
      }
      return new Uint8Array(buffer);
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
  }

  try {
    return new Uint8Array(await readWithFileReader(file));
  } catch (err) {
    lastError = err;
  }

  const detail = lastError instanceof Error ? lastError.message : "I/O read failed";
  throw new Error(
    `Could not read “${file.name}” (${detail}). Download it to this device and select it again.`,
  );
}

/**
 * Copy a picker/drop file into browser-owned memory before Safari can revoke
 * the original input or DataTransfer handle.
 */
export async function snapshotIngestFile(file: File): Promise<File> {
  const bytes = await readFileBytes(file);
  return new File([bytes as BlobPart], file.name, {
    // Preserve an empty MIME type so ingestFile can infer it from the extension.
    type: file.type,
    lastModified: file.lastModified,
  });
}

async function uploadToStorage(
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  // Ask the server (service role) for a signed upload URL — no bucket RLS needed.
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  let path: string;
  let signedUrl: string;
  try {
    const res = await fetch("/api/ingest/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ext }),
    });
    const json = (await res.json()) as {
      path?: string;
      token?: string;
      signedUrl?: string;
      error?: string;
    };
    if (!res.ok || !json.path || !json.signedUrl) {
      return { ok: false, error: json.error ?? `Could not prepare upload (${res.status}).` };
    }
    path = json.path;
    signedUrl = json.signedUrl;
  } catch (err) {
    const detail = err instanceof Error ? err.message : "network error";
    return { ok: false, error: `Could not prepare upload (${detail}).` };
  }

  // PUT straight to the signed URL. Do NOT go through the browser Supabase
  // client — it attaches the publishable/anon key as `apikey`, and storage
  // error responses then lose CORS, which the browser reports as the useless
  // "Load failed" / "Failed to fetch". The token in the signed URL is enough.
  try {
    const put = await fetch(signedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false",
      },
      body: file,
    });
    if (!put.ok) {
      const body = await put.text().catch(() => "");
      return {
        ok: false,
        error: `Upload failed (${put.status}). ${body.slice(0, 180) || "Storage rejected the file."}`,
      };
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : "network error";
    return {
      ok: false,
      error: `Upload failed (${detail}). Try a smaller PDF, or export to CSV/XLSX.`,
    };
  }
  return { ok: true, path };
}

async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([bytes as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function postExtract(
  payload: {
    fileBase64?: string;
    storagePath?: string;
    mediaType: string;
    filename: string;
  },
): Promise<IngestResult> {
  const json = JSON.stringify(payload);
  const raw = new TextEncoder().encode(json);
  const needsGzip = raw.length > VERCEL_BODY_MAX;
  const gzipped = needsGzip ? await gzipBytes(raw) : null;
  const useGzip = Boolean(gzipped && gzipped.length <= VERCEL_BODY_MAX);
  const body: BodyInit = useGzip
    ? new Blob([gzipped! as BlobPart], { type: "application/json" })
    : json;
  if (needsGzip && !useGzip) {
    return {
      ok: false,
      error: "File is too large to send inline and gzip did not shrink it enough. Try a smaller PDF.",
    };
  }

  try {
    const res = await fetch("/api/ingest/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Do NOT set Content-Encoding — browsers/CDNs treat that as a
        // transport header and the POST never reaches the server ("Load failed").
        ...(useGzip ? { "X-FundOS-Encoding": "gzip" } : {}),
      },
      credentials: "include",
      body,
      signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
    });
    const text = await res.text();
    let parsed: { entities?: ExtractedEntities; error?: string };
    try {
      parsed = JSON.parse(text) as { entities?: ExtractedEntities; error?: string };
    } catch {
      return {
        ok: false,
        error: `Extraction failed (${res.status}). ${text.slice(0, 180) || "Empty response — try a smaller file or sign in again."}`,
      };
    }
    if (!res.ok || !parsed.entities) {
      return { ok: false, error: parsed.error ?? `Extraction failed (${res.status})` };
    }
    return { ok: true, entities: parsed.entities, method: "extraction" };
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    const detail = err instanceof Error ? err.message : "network error";
    if (name === "TimeoutError" || name === "AbortError" || /timeout|aborted/i.test(detail)) {
      return {
        ok: false,
        error: `Extraction timed out after ${EXTRACT_TIMEOUT_MS / 1000}s. The document may be too large or the OCR service is stuck — try a smaller PDF.`,
      };
    }
    return {
      ok: false,
      error: `Could not reach the extraction service (${detail}). Check your connection or try a smaller PDF.`,
    };
  }
}

export async function ingestFile(file: File): Promise<IngestResult> {
  try {
    return await ingestFileInner(file);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unexpected error";
    return { ok: false, error: `Ingest failed: ${detail}` };
  }
}

async function ingestFileInner(file: File): Promise<IngestResult> {
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

    // Prefer gzipped inline base64 so a ~3.7 MB SHA stays under Vercel's 4.5 MB
    // body cap (base64 inflates ~33%; gzip usually takes that back off). Fall
    // back to Storage only when the compressed payload still will not fit.
    // Snapshot the bytes once. This prevents background processing from
    // depending on a stale DataTransfer/iCloud file handle and also avoids a
    // second disk read if the Storage fallback is needed.
    const bytes = await readFileBytes(file);
    const stableFile = new File([bytes as BlobPart], file.name, {
      type: file.type || mediaType,
      lastModified: file.lastModified,
    });
    const inlinePayload = {
      fileBase64: bytesToBase64(bytes),
      mediaType,
      filename: file.name,
    };
    const inlineJson = new TextEncoder().encode(JSON.stringify(inlinePayload));
    const gzipped = await gzipBytes(inlineJson);
    const gzipFits = Boolean(gzipped && gzipped.length <= VERCEL_BODY_MAX);
    const rawFits = inlineJson.length <= VERCEL_BODY_MAX;

    if (gzipFits || rawFits) {
      return postExtract(inlinePayload);
    }

    const uploaded = await uploadToStorage(stableFile);
    if (!uploaded.ok) return uploaded;
    return postExtract({
      storagePath: uploaded.path,
      mediaType,
      filename: file.name,
    });
  }

  return {
    ok: false,
    error: `Unsupported file: ${file.name}. Use CSV/XLSX for bulk import, or PDF/DOCX/image for extraction (export other formats like PPTX to PDF).`,
  };
}
