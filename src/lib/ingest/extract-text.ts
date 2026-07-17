/**
 * Server-side text extraction for the text-only extraction backends
 * (DeepSeek / any OpenAI-compatible text model). DOCX → mammoth; PDF → unpdf.
 * Images throw TEXT_UNSUPPORTED — they need a vision model or OCR, which the
 * text backends don't provide.
 */

import mammoth from "mammoth";
import { DOCX_MEDIA_TYPE } from "@/lib/ingest/schema";

export const TEXT_UNSUPPORTED = "TEXT_UNSUPPORTED";

export async function extractText(fileBase64: string, mediaType: string): Promise<string> {
  const buffer = Buffer.from(fileBase64, "base64");

  if (mediaType === DOCX_MEDIA_TYPE) {
    const { value } = await mammoth.extractRawText({ buffer });
    return value.trim();
  }

  if (mediaType === "application/pdf") {
    // Dynamic import keeps unpdf (and its pdfjs build) out of paths that don't need it.
    const { extractText: pdfExtract, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await pdfExtract(pdf, { mergePages: true });
    return (Array.isArray(text) ? text.join("\n") : text).trim();
  }

  throw new Error(TEXT_UNSUPPORTED);
}
