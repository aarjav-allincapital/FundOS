/**
 * Ingestion types. `ExtractedEntities` is the single normalized payload both
 * adapters (spreadsheet parse + LLM extraction) produce. It intentionally
 * mirrors the Add*Input shapes in lib/data/mutations.ts, but references
 * companies by NAME (ids don't exist until commit) and leaves everything
 * nullable — an adapter must never invent a value it isn't sure of.
 */

export interface ExtractedCompany {
  legal_name: string;
  brand_name?: string | null;
  sector?: string | null;
  hq_city?: string | null;
  hq_country?: string | null;
  operating_currency?: string | null; // "INR" | "USD"
  website?: string | null;
}

export interface ExtractedFounder {
  company_name: string;
  name: string;
  role?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
}

export interface ExtractedLot {
  company_name: string;
  /** The investor this line belongs to. A round with N investors yields N lots;
   *  the user picks their own fund's lot in review. */
  investor_name?: string | null;
  fund_code?: string | null; // "AIC-F1" | "F1" | "F2" — resolved to a fund at commit
  round_name?: string | null;
  investment_date?: string | null; // ISO YYYY-MM-DD
  vehicle?: string | null; // instrument type (free text; mapped at commit)
  shares_acquired?: number | null;
  price_per_share_local?: number | null;
  currency?: string | null;
  cash_invested_local?: number | null; // if absent, derived from shares × price
  ownership_at_entry_pct?: number | null;
}

export interface ExtractedMark {
  company_name: string;
  valuation_date?: string | null; // ISO
  price_per_share_local?: number | null;
  post_money_local?: number | null;
  valuation_type?: string | null;
}

export interface ExtractedEntities {
  companies: ExtractedCompany[];
  founders: ExtractedFounder[];
  lots: ExtractedLot[];
  marks: ExtractedMark[];
}

export function emptyEntities(): ExtractedEntities {
  return { companies: [], founders: [], lots: [], marks: [] };
}

// ------------------------------------------------------------------
// Review-queue drafts (ephemeral — live in the ingest page's state)
// ------------------------------------------------------------------

export type DraftKind = "company" | "founder" | "lot" | "mark";

export interface Provenance {
  /** Source file name. */
  source: string;
  method: "spreadsheet" | "extraction";
  /** 0..1 when the LLM reports it; null for deterministic parses. */
  confidence?: number | null;
}

export interface DraftRecord<T = unknown> {
  id: string;
  kind: DraftKind;
  data: T;
  provenance: Provenance;
  /** Whether this row will be committed. */
  include: boolean;
  /** True when a matching record already exists in FundOS (company/founder). */
  existing?: boolean;
}

export interface CommitSummary {
  companiesCreated: number;
  companiesReused: number;
  founders: number;
  foundersReused: number;
  lots: number;
  marks: number;
  skipped: number;
}
