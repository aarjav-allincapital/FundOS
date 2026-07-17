/**
 * Bulk-import adapter: CSV / XLSX → ExtractedEntities, fully client-side and
 * deterministic (no LLM). One row → one company (deduped within the sheet) +
 * one investment lot. Headers are fuzzy-matched to fields, so real-world export
 * headers ("Company Name", "Price / Share", "Invested Amount") map without
 * hand-configuration. Cash is derived from shares × price when not supplied,
 * reusing the same rule as manual lot entry.
 */

import * as XLSX from "xlsx";
import { calcCashInvestedLocal } from "@/lib/calc/lot";
import {
  emptyEntities,
  type ExtractedEntities,
  type ExtractedLot,
} from "@/lib/ingest/types";

type Field =
  | "company"
  | "brand"
  | "sector"
  | "website"
  | "country"
  | "city"
  | "fund"
  | "round"
  | "date"
  | "shares"
  | "price"
  | "amount"
  | "currency"
  | "ownership";

/** Candidate header aliases per field (normalized, no spaces/punctuation). */
const FIELD_ALIASES: Record<Field, string[]> = {
  company: ["company", "companyname", "name", "startup", "portfolioco", "investee"],
  brand: ["brand", "brandname", "dba"],
  sector: ["sector", "industry", "vertical"],
  website: ["website", "url", "site", "web"],
  country: ["country", "hqcountry", "geography", "geo"],
  city: ["city", "hqcity", "location"],
  fund: ["fund", "vehicle", "fundcode", "fundvehicle"],
  round: ["round", "stage", "roundname", "series"],
  date: ["date", "investmentdate", "investeddate", "entrydate", "investedon", "dateofinvestment"],
  shares: ["shares", "sharesacquired", "units", "noofshares", "numberofshares"],
  price: ["price", "pricepershare", "pps", "priceshare", "sharepr", "issueprice"],
  amount: ["amount", "cashinvested", "invested", "investment", "cash", "investedamount", "amountinvested"],
  currency: ["currency", "ccy", "curr"],
  ownership: ["ownership", "ownershippct", "stake", "stakepct", "ownershippercent", "equity"],
};

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Map each sheet column to a field (first alias match wins). */
function mapHeaders(headers: string[]): Partial<Record<Field, string>> {
  const map: Partial<Record<Field, string>> = {};
  for (const raw of headers) {
    const norm = normHeader(raw);
    for (const field of Object.keys(FIELD_ALIASES) as Field[]) {
      if (map[field]) continue;
      if (FIELD_ALIASES[field].some((a) => a === norm)) {
        map[field] = raw;
        break;
      }
    }
  }
  return map;
}

/** Parse a money/number cell: strips currency symbols and thousands separators. */
export function parseNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizeCurrency(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim().toUpperCase();
  if (!s) return null;
  if (s.includes("₹") || s === "INR" || s === "RS" || s === "RUPEE") return "INR";
  if (s.includes("$") || s === "USD" || s === "USDOLLAR") return "USD";
  if (/^[A-Z]{3}$/.test(s)) return s;
  return null;
}

/** Minimal CSV parser: handles quoted fields, embedded commas, and "" escapes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); field = "";
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = (r[idx] ?? "").trim(); });
      return obj;
    });
}

function isXlsx(filename: string): boolean {
  return /\.(xlsx|xlsm|xls)$/i.test(filename);
}

/** Read rows from a CSV string or XLSX ArrayBuffer/Buffer. */
function readRows(filename: string, content: string | ArrayBuffer): Record<string, unknown>[] {
  if (isXlsx(filename) && typeof content !== "string") {
    const wb = XLSX.read(content, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: "" });
  }
  const text = typeof content === "string" ? content : new TextDecoder().decode(content);
  return parseCsv(text);
}

export function parseSpreadsheet(
  filename: string,
  content: string | ArrayBuffer
): ExtractedEntities {
  const rows = readRows(filename, content);
  const out = emptyEntities();
  if (rows.length === 0) return out;

  const headers = Object.keys(rows[0]);
  const cols = mapHeaders(headers);
  if (!cols.company) return out; // without a company column there's nothing to anchor rows to

  const seen = new Map<string, number>(); // normalized name → index in out.companies
  const cell = (row: Record<string, unknown>, field: Field): unknown =>
    cols[field] ? row[cols[field] as string] : undefined;
  const str = (v: unknown): string | undefined => {
    const s = v == null ? "" : String(v).trim();
    return s === "" ? undefined : s;
  };

  for (const row of rows) {
    const name = str(cell(row, "company"));
    if (!name) continue;

    const currency = normalizeCurrency(cell(row, "currency"));
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, out.companies.length);
      out.companies.push({
        legal_name: name,
        brand_name: str(cell(row, "brand")) ?? null,
        sector: str(cell(row, "sector")) ?? null,
        hq_city: str(cell(row, "city")) ?? null,
        hq_country: str(cell(row, "country")) ?? null,
        operating_currency: currency,
        website: str(cell(row, "website")) ?? null,
      });
    } else if (currency) {
      const existing = out.companies[seen.get(key)!];
      if (!existing.operating_currency) existing.operating_currency = currency;
    }

    const shares = parseNumber(cell(row, "shares"));
    const price = parseNumber(cell(row, "price"));
    const amount = parseNumber(cell(row, "amount"));
    // Only emit a lot when the row carries position economics.
    if (shares == null && price == null && amount == null) continue;

    const cash =
      amount != null
        ? amount
        : shares != null && price != null
          ? calcCashInvestedLocal(shares, price)
          : null;

    const lot: ExtractedLot = {
      company_name: name,
      fund_code: str(cell(row, "fund")) ?? null,
      round_name: str(cell(row, "round")) ?? null,
      investment_date: str(cell(row, "date")) ?? null,
      shares_acquired: shares,
      price_per_share_local: price,
      currency,
      cash_invested_local: cash,
      ownership_at_entry_pct: parseNumber(cell(row, "ownership")),
    };
    out.lots.push(lot);
  }

  return out;
}
