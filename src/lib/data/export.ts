/**
 * Portfolio data export — full-fidelity JSON, a multi-sheet Excel workbook, and
 * per-entity CSV. Unlike the LP report (which is a calc-derived summary), these
 * dump the raw relational tables so the export can round-trip back through the
 * importer.
 */

import * as XLSX from "xlsx";
import type { FundOSData } from "@/lib/types";

/** The relational tables we export, in a stable, human-friendly order. */
export const EXPORT_ENTITIES: { key: keyof FundOSData; label: string }[] = [
  { key: "fundBrands", label: "Fund brands" },
  { key: "funds", label: "Funds" },
  { key: "companies", label: "Companies" },
  { key: "founders", label: "Founders" },
  { key: "rounds", label: "Rounds" },
  { key: "roundInvestors", label: "Round investors" },
  { key: "investmentLots", label: "Investment lots" },
  { key: "valuationMarks", label: "Valuation marks" },
  { key: "positionSnapshots", label: "Position snapshots" },
  { key: "realizations", label: "Realizations" },
  { key: "fxRates", label: "FX rates" },
  { key: "documents", label: "Documents" },
];

export type ExportEntityKey = (typeof EXPORT_ENTITIES)[number]["key"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Rows of a table flattened so nested objects/arrays survive a spreadsheet cell. */
function flattenRows(rows: unknown[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const obj = (row ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] =
        v !== null && typeof v === "object" ? JSON.stringify(v) : (v as unknown);
    }
    return out;
  });
}

/** Full relational dataset as pretty-printed JSON — the canonical backup format. */
export function downloadDataJson(data: FundOSData, asOf = todayIso()) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, `FundOS-export-${asOf}.json`);
}

/** One Excel workbook with a sheet per table (raw rows). */
export function downloadDataExcel(data: FundOSData, asOf = todayIso()) {
  const wb = XLSX.utils.book_new();
  for (const { key } of EXPORT_ENTITIES) {
    const rows = flattenRows((data[key] as unknown[]) ?? []);
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
    // Excel caps sheet names at 31 chars; all our keys are shorter.
    XLSX.utils.book_append_sheet(wb, ws, String(key).slice(0, 31));
  }
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `FundOS-export-${asOf}.xlsx`,
  );
}

/** A single table as CSV. */
export function downloadEntityCsv(
  data: FundOSData,
  key: ExportEntityKey,
  asOf = todayIso(),
) {
  const rows = flattenRows((data[key] as unknown[]) ?? []);
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  const csv = XLSX.utils.sheet_to_csv(ws);
  downloadBlob(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
    `FundOS-${String(key)}-${asOf}.csv`,
  );
}
