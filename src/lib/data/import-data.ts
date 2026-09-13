/**
 * Import adapter: turns an uploaded file into one of two outcomes —
 *  1. a FULL FundOSData snapshot (a JSON backup previously exported here), which
 *     replaces the working dataset, or
 *  2. a set of ExtractedEntities (CSV / Excel rows, or an entities-shaped JSON),
 *     which flow through the same review + commit path as ingest.
 *
 * Parsing is deterministic and client-side; nothing is written until the caller
 * commits.
 */

import { parseSpreadsheet } from "@/lib/ingest/parse-spreadsheet";
import { emptyEntities, type ExtractedEntities } from "@/lib/ingest/types";
import type { FundOSData } from "@/lib/types";

/** Every relational table FundOSData carries — used to detect + normalize backups. */
const FUNDOS_KEYS: (keyof FundOSData)[] = [
  "fundBrands",
  "funds",
  "companies",
  "founders",
  "deals",
  "dealStageHistory",
  "rounds",
  "roundInvestors",
  "termSheets",
  "investmentLots",
  "valuationMarks",
  "positionSnapshots",
  "fxRates",
  "realizations",
  "documents",
];

export type ImportParseResult =
  | { kind: "full"; data: FundOSData; counts: Record<string, number> }
  | { kind: "entities"; entities: ExtractedEntities; label: string }
  | { kind: "error"; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A full backup has the core relational tables as arrays. */
function looksLikeFullData(v: unknown): v is Partial<FundOSData> {
  if (!isRecord(v)) return false;
  const hasCore =
    Array.isArray(v.companies) &&
    Array.isArray(v.investmentLots) &&
    Array.isArray(v.funds);
  return hasCore;
}

/** Fill any missing tables with empty arrays so older exports still load. */
function normalizeFullData(v: Partial<FundOSData>): FundOSData {
  const out = {} as FundOSData;
  for (const key of FUNDOS_KEYS) {
    const value = v[key];
    // @ts-expect-error — index write over the union of array types.
    out[key] = Array.isArray(value) ? value : [];
  }
  return out;
}

function looksLikeEntities(v: unknown): v is Partial<ExtractedEntities> {
  if (!isRecord(v)) return false;
  return (
    Array.isArray(v.companies) ||
    Array.isArray(v.lots) ||
    Array.isArray(v.founders) ||
    Array.isArray(v.marks)
  );
}

function normalizeEntities(v: Partial<ExtractedEntities>): ExtractedEntities {
  const e = emptyEntities();
  if (Array.isArray(v.companies)) e.companies = v.companies;
  if (Array.isArray(v.founders)) e.founders = v.founders;
  if (Array.isArray(v.lots)) e.lots = v.lots;
  if (Array.isArray(v.marks)) e.marks = v.marks;
  return e;
}

function counts(data: FundOSData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of FUNDOS_KEYS) {
    out[key] = (data[key] as unknown[]).length;
  }
  return out;
}

export async function parseImportFile(file: File): Promise<ImportParseResult> {
  const name = file.name.toLowerCase();

  try {
    if (name.endsWith(".json")) {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (looksLikeFullData(parsed)) {
        const data = normalizeFullData(parsed);
        return { kind: "full", data, counts: counts(data) };
      }
      if (looksLikeEntities(parsed)) {
        return {
          kind: "entities",
          entities: normalizeEntities(parsed),
          label: file.name,
        };
      }
      return {
        kind: "error",
        error:
          "Unrecognized JSON. Expected a FundOS export (full backup) or an entities file.",
      };
    }

    if (name.endsWith(".csv")) {
      return {
        kind: "entities",
        entities: parseSpreadsheet(file.name, await file.text()),
        label: file.name,
      };
    }

    if (/\.(xlsx|xlsm|xls)$/.test(name)) {
      return {
        kind: "entities",
        entities: parseSpreadsheet(file.name, await file.arrayBuffer()),
        label: file.name,
      };
    }

    return {
      kind: "error",
      error: `Unsupported file: ${file.name}. Use JSON, CSV, or Excel (.xlsx).`,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "could not read file";
    return { kind: "error", error: `Import failed: ${detail}` };
  }
}
