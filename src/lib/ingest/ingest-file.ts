/**
 * Client-side file router: sends a dropped file down the right adapter.
 * CSV/XLSX parse in the browser; PDF/images POST to /api/ingest/extract.
 */

import { parseSpreadsheet } from "@/lib/ingest/parse-spreadsheet";
import { DOCX_MEDIA_TYPE } from "@/lib/ingest/schema";
import type { ExtractedEntities, Provenance } from "@/lib/ingest/types";

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
    try {
      const res = await fetch("/api/ingest/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: await fileToBase64(file), mediaType, filename: file.name }),
      });
      const json = (await res.json()) as { entities?: ExtractedEntities; error?: string };
      if (!res.ok || !json.entities) {
        return { ok: false, error: json.error ?? `Extraction failed (${res.status})` };
      }
      return { ok: true, entities: json.entities, method: "extraction" };
    } catch {
      return { ok: false, error: "Could not reach the extraction service." };
    }
  }

  return {
    ok: false,
    error: `Unsupported file: ${file.name}. Use CSV/XLSX for bulk import, or PDF/DOCX/image for extraction (export other formats like PPTX to PDF).`,
  };
}
