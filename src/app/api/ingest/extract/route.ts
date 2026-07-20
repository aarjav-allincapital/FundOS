import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import {
  DOCX_MEDIA_TYPE,
  EXTRACTION_JSON_INSTRUCTION,
  EXTRACTION_SCHEMA,
  EXTRACTION_SYSTEM,
  EXTRACTION_TOOL_NAME,
  SUPPORTED_MEDIA_TYPES,
} from "@/lib/ingest/schema";
import { extractText, TEXT_UNSUPPORTED } from "@/lib/ingest/extract-text";
import { emptyEntities, type ExtractedEntities } from "@/lib/ingest/types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

// Node runtime — the SDK, mammoth, and unpdf need Node, not the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Gemini OCR on large multi-page scans is slow; take the max the plan allows. */
export const maxDuration = 300;

function env(key: string): string | undefined {
  const v = process.env[key];
  return v?.trim() || undefined;
}

interface ExtractRequest {
  /** Inline base64 for small files (< ~3MB) sent directly in the request body. */
  fileBase64?: string;
  /** Storage object path for large files (up to bucket cap), downloaded server-side. */
  storagePath?: string;
  mediaType?: string;
  filename?: string;
}

const INGEST_BUCKET = "ingest-uploads";

/** Pull a large upload out of Supabase Storage and return it as base64. */
async function loadFromStorage(storagePath: string): Promise<string> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new HttpError("Storage is not configured on the server.", 503);
  }
  const { data, error } = await admin.storage
    .from(INGEST_BUCKET)
    .download(storagePath);
  if (error || !data) {
    throw new HttpError(
      `Could not read the uploaded file: ${error?.message ?? "not found"}.`,
      400,
    );
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  return buffer.toString("base64");
}

/** Best-effort cleanup of a transient upload. */
async function removeFromStorage(storagePath: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  await admin.storage.from(INGEST_BUCKET).remove([storagePath]).catch(() => {});
}

const NO_CREDS =
  "No extraction backend configured. Pick ONE in .env.local: (1) OPENROUTER_API_KEY (one key → Gemini & other vision models, no Google project — openrouter.ai); (2) GEMINI_API_KEY (native OCR of scans; aistudio.google.com); (3) DEEPSEEK_API_KEY (cheapest, but TEXT PDFs/DOCX only — no OCR); (4) ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN. Bulk CSV/XLSX import needs no backend.";

const OAUTH_HEADERS = { "anthropic-beta": "oauth-2025-04-20" };

function anthropicClient(): Anthropic | null {
  if (process.env.ANTHROPIC_API_KEY) return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  if (process.env.ANTHROPIC_AUTH_TOKEN) {
    return new Anthropic({ authToken: process.env.ANTHROPIC_AUTH_TOKEN, defaultHeaders: OAUTH_HEADERS });
  }
  return null;
}

/** Parse a JSON object from model output that may be fenced or padded with prose. */
function parseEntitiesLoose(content: string): ExtractedEntities {
  let s = content.trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    s = fenced[1].trim();
  } else {
    const first = s.indexOf("{");
    const last = s.lastIndexOf("}");
    if (first >= 0 && last > first) s = s.slice(first, last + 1);
  }
  return shapeEntities(JSON.parse(s) as Partial<ExtractedEntities>);
}

function shapeEntities(raw: Partial<ExtractedEntities> | null | undefined): ExtractedEntities {
  const r = raw ?? {};
  return {
    ...emptyEntities(),
    companies: Array.isArray(r.companies) ? r.companies : [],
    founders: Array.isArray(r.founders) ? r.founders : [],
    lots: Array.isArray(r.lots) ? r.lots : [],
    marks: Array.isArray(r.marks) ? r.marks : [],
  };
}

export async function POST(request: Request) {
  let body: ExtractRequest;
  try {
    body = (await request.json()) as ExtractRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { storagePath, mediaType, filename } = body;
  if (!mediaType) {
    return NextResponse.json({ error: "mediaType is required" }, { status: 400 });
  }
  if (!body.fileBase64 && !storagePath) {
    return NextResponse.json({ error: "fileBase64 or storagePath is required" }, { status: 400 });
  }

  const isDocx = mediaType === DOCX_MEDIA_TYPE;
  const isNative = SUPPORTED_MEDIA_TYPES.includes(mediaType as (typeof SUPPORTED_MEDIA_TYPES)[number]);
  if (!isDocx && !isNative) {
    return NextResponse.json(
      { error: `Unsupported type ${mediaType}. Extraction supports PDF, DOCX, and images; export other formats (e.g. PPTX) to PDF.` },
      { status: 400 }
    );
  }

  // Provider precedence: OpenRouter (one key → Gemini & other vision models,
  // no Google project) → Gemini → DeepSeek (text only) → Anthropic. First wins.
  try {
    // Large files arrive via Storage; small ones inline. Resolve to base64 once.
    const fileBase64 = storagePath ? await loadFromStorage(storagePath) : body.fileBase64!;
    const cleanup = () => (storagePath ? removeFromStorage(storagePath) : Promise.resolve());
    try {
      return await runExtraction(fileBase64, mediaType, filename);
    } finally {
      await cleanup();
    }
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: NO_CREDS }, { status: 400 });
    const detail = e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : "extraction failed";
    return NextResponse.json({ error: `Extraction error: ${detail}` }, { status: 502 });
  }
}

async function runExtraction(
  fileBase64: string,
  mediaType: string,
  filename?: string,
): Promise<NextResponse> {
    if (env("OPENROUTER_API_KEY")) {
      const entities = await extractWithOpenRouter(fileBase64, mediaType, filename);
      return NextResponse.json({ entities });
    }
    if (env("GEMINI_API_KEY")) {
      const entities = await extractWithGemini(fileBase64, mediaType, filename);
      return NextResponse.json({ entities });
    }
    if (env("DEEPSEEK_API_KEY")) {
      const entities = await extractWithOpenAICompatible(fileBase64, mediaType, filename);
      return NextResponse.json({ entities });
    }
    const anthropic = anthropicClient();
    if (anthropic) {
      const entities = await extractWithAnthropic(anthropic, fileBase64, mediaType, filename);
      return NextResponse.json({ entities });
    }
    return NextResponse.json({ error: NO_CREDS }, { status: 400 });
}

class HttpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// ------------------------------------------------------------------
// OpenRouter (one key → Gemini & other vision models; OCRs scans)
// ------------------------------------------------------------------

type ORPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

async function extractWithOpenRouter(
  fileBase64: string,
  mediaType: string,
  filename?: string
): Promise<ExtractedEntities> {
  const base = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const model = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";
  // Scanned PDFs need OCR: "native" lets a vision model (Gemini) OCR them;
  // set OPENROUTER_PDF_ENGINE=mistral-ocr for a dedicated OCR engine instead.
  const pdfEngine = process.env.OPENROUTER_PDF_ENGINE || "native";

  const parts: ORPart[] = [];
  let plugins: { id: string; pdf: { engine: string } }[] | undefined;

  if (mediaType === DOCX_MEDIA_TYPE) {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(fileBase64, "base64") });
    const text = value.trim();
    if (!text) throw new HttpError("The .docx file has no readable text.", 400);
    parts.push({ type: "text", text: `--- DOCUMENT TEXT (${filename ?? "document.docx"}) ---\n${text}` });
  } else if (mediaType === "application/pdf") {
    parts.push({
      type: "file",
      file: { filename: filename ?? "document.pdf", file_data: `data:application/pdf;base64,${fileBase64}` },
    });
    plugins = [{ id: "file-parser", pdf: { engine: pdfEngine } }];
  } else {
    parts.push({ type: "image_url", image_url: { url: `data:${mediaType};base64,${fileBase64}` } });
  }
  parts.push({
    type: "text",
    text: `Extract every company, founder, investment lot, and valuation mark from this file (${filename ?? "document"}). OCR any scanned or low-quality text carefully. Use null for anything not clearly present. Return the JSON object now.`,
  });

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://fundos.local",
      "X-Title": "FundOS Ingest",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 8000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${EXTRACTION_SYSTEM}\n\n${EXTRACTION_JSON_INSTRUCTION}` },
        { role: "user", content: parts },
      ],
      ...(plugins ? { plugins } : {}),
    }),
  });

  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      msg = err.error?.message ?? msg;
    } catch {
      /* keep status */
    }
    const hint = res.status === 401 ? " (check OPENROUTER_API_KEY)" : "";
    throw new HttpError(`OpenRouter error: ${msg}${hint}`, res.status === 401 ? 400 : 502);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new HttpError("OpenRouter returned no content", 502);

  try {
    return parseEntitiesLoose(content);
  } catch {
    throw new HttpError("OpenRouter returned invalid JSON", 502);
  }
}

// ------------------------------------------------------------------
// Gemini (native OCR of scanned/poor-quality PDFs + images)
// ------------------------------------------------------------------

async function extractWithGemini(
  fileBase64: string,
  mediaType: string,
  filename?: string
): Promise<ExtractedEntities> {
  // PDF/image go to Gemini as inline data (it OCRs scans natively). DOCX has a
  // text layer already, so extract it rather than sending a binary Gemini can't read.
  const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];
  if (mediaType === DOCX_MEDIA_TYPE) {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(fileBase64, "base64") });
    const text = value.trim();
    if (!text) throw new HttpError("The .docx file has no readable text.", 400);
    parts.push({ text: `--- DOCUMENT TEXT (${filename ?? "document.docx"}) ---\n${text}` });
  } else {
    parts.push({ inline_data: { mime_type: mediaType, data: fileBase64 } });
  }
  parts.push({
    text: `Extract every company, founder, investment lot, and valuation mark from this file (${filename ?? "document"}). OCR any scanned or low-quality text carefully. Use null for anything not clearly present. Return the JSON object now.`,
  });

  const base = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  // "…-latest" alias tracks the current model so it doesn't go stale; bump to
  // gemini-pro-latest / gemini-3-pro-preview for the hardest scans.
  const model = env("GEMINI_MODEL") || "gemini-flash-latest";
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) throw new HttpError("GEMINI_API_KEY is not configured.", 400);

  const res = await fetch(`${base}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${EXTRACTION_SYSTEM}\n\n${EXTRACTION_JSON_INSTRUCTION}` }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        // Big budget so long multi-page scans don't truncate the JSON, and no
        // "thinking" (it isn't needed for extraction and would eat the budget).
        maxOutputTokens: 65536,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      msg = err.error?.message ?? msg;
    } catch {
      /* keep status */
    }
    const hint = res.status === 400 || res.status === 403 ? " (check GEMINI_API_KEY)" : "";
    throw new HttpError(`Gemini error: ${msg}${hint}`, res.status === 403 ? 400 : 502);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  const candidate = data.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const content = candidate?.content?.parts?.map((p) => p.text ?? "").join("").trim();

  if (!content) {
    const why = data.promptFeedback?.blockReason
      ? `blocked (${data.promptFeedback.blockReason})`
      : finishReason
        ? `finishReason=${finishReason}`
        : "empty response";
    throw new HttpError(`Gemini returned no content — ${why}.`, 502);
  }
  if (finishReason && finishReason !== "STOP") {
    // MAX_TOKENS etc. → the JSON is almost certainly cut off.
    throw new HttpError(
      `Gemini stopped early (${finishReason}) — the document is likely too large for one pass. Try splitting it or a model with more output.`,
      502
    );
  }

  try {
    return parseEntitiesLoose(content);
  } catch {
    console.error("[ingest] Gemini JSON parse failed. finishReason=%s, content head:\n%s", finishReason, content.slice(0, 1200));
    throw new HttpError("Gemini returned invalid JSON", 502);
  }
}

// ------------------------------------------------------------------
// DeepSeek / OpenAI-compatible text model (text-only)
// ------------------------------------------------------------------

async function extractWithOpenAICompatible(
  fileBase64: string,
  mediaType: string,
  filename?: string
): Promise<ExtractedEntities> {
  let text: string;
  try {
    text = await extractText(fileBase64, mediaType);
  } catch (e) {
    if (e instanceof Error && e.message === TEXT_UNSUPPORTED) {
      throw new HttpError(
        "This backend (DeepSeek) is text-only — it can't read images. Use a text-based PDF, DOCX, or CSV, or switch to the Anthropic backend for image/scanned input.",
        400
      );
    }
    throw new HttpError("Could not read the file.", 400);
  }
  if (!text) throw new HttpError("No readable text found in the file.", 400);

  const base = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 8000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${EXTRACTION_SYSTEM}\n\n${EXTRACTION_JSON_INSTRUCTION}` },
        { role: "user", content: `Document: ${filename ?? "document"}\n\n${text}\n\nReturn the JSON object now.` },
      ],
    }),
  });

  if (!res.ok) {
    const detail = res.status === 401 ? "auth failed — check DEEPSEEK_API_KEY" : `${res.status}`;
    throw new HttpError(`DeepSeek error: ${detail}`, res.status === 401 ? 400 : 502);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new HttpError("DeepSeek returned no content", 502);

  try {
    return shapeEntities(JSON.parse(content) as Partial<ExtractedEntities>);
  } catch {
    throw new HttpError("DeepSeek returned invalid JSON", 502);
  }
}

// ------------------------------------------------------------------
// Anthropic (native vision + PDF)
// ------------------------------------------------------------------

async function extractWithAnthropic(
  client: Anthropic,
  fileBase64: string,
  mediaType: string,
  filename?: string
): Promise<ExtractedEntities> {
  let fileContent: Anthropic.ContentBlockParam;
  if (mediaType === DOCX_MEDIA_TYPE) {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(fileBase64, "base64") });
    const text = value.trim();
    if (!text) throw new HttpError("The .docx file has no readable text.", 400);
    fileContent = { type: "text", text: `--- DOCUMENT TEXT (${filename ?? "document.docx"}) ---\n${text}` };
  } else if (mediaType === "application/pdf") {
    fileContent = {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: fileBase64 },
    };
  } else {
    fileContent = {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
        data: fileBase64,
      },
    };
  }

  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    system: EXTRACTION_SYSTEM,
    tools: [
      {
        name: EXTRACTION_TOOL_NAME,
        description: "Record the structured entities extracted from the document.",
        input_schema: EXTRACTION_SCHEMA as unknown as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: EXTRACTION_TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [
          fileContent,
          {
            type: "text",
            text: `Extract every company, founder, investment lot, and valuation mark from this file (${filename ?? "document"}). Use null for anything not clearly present.`,
          },
        ],
      },
    ],
  });

  const toolUse = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === EXTRACTION_TOOL_NAME
  );
  if (!toolUse) throw new HttpError("Model returned no structured extraction", 502);
  return shapeEntities(toolUse.input as Partial<ExtractedEntities>);
}
