/**
 * Type-safe mirror of the FundOS Postgres schema.
 * Source of truth: supabase/migrations/001_portfolio_schema.sql (+ 002).
 *
 * These types intentionally match column names and shapes 1:1 so the
 * repository/calculation layers can move to a live Supabase client with
 * zero shape changes.
 */

// ------------------------------------------------------------------
// Enums (mirrors CREATE TYPE ... AS ENUM)
// ------------------------------------------------------------------

export type InstrumentType = "ccps" | "preferred" | "common" | "safe" | "note";

export type LotStatus =
  | "draft"
  | "termsheet"
  | "committed"
  | "active"
  | "partial_exit"
  | "full_exit"
  | "written_off";

export type ValuationType =
  | "round_pricing"
  | "internal_mark"
  | "external_mark"
  | "write_down"
  | "write_off";

export type DealStage =
  | "sourcing"
  | "first_call"
  | "second_call"
  | "investment_committee"
  | "closing"
  | "post_investment"
  | "monitoring"
  | "exit"
  | "passed"
  | "archived";

export type DealSource =
  | "inbound"
  | "outbound"
  | "partner_referral"
  | "internal_lead"
  | "external_lead";

export type TermSheetStatus =
  | "draft"
  | "pending"
  | "signed"
  | "superseded"
  | "withdrawn";

export type ApprovalStatus = "draft" | "pending" | "approved";

export type CurrencyCode = "USD" | "INR" | string;

// ------------------------------------------------------------------
// Tables
// ------------------------------------------------------------------

export interface FundBrand {
  id: string;
  abbr: string;
  name: string;
  created_at: string;
}

export interface Fund {
  id: string;
  fund_brand_id: string;
  vehicle_code: string; // F1, F2
  code: string; // AIC-F1
  name: string;
  currency: CurrencyCode;
  vintage_year: number | null;
  status: string;
  /** Fund economics (optional) — drive Net IRR. See lib/calc/irr.ts. */
  committed_capital_fund?: number | null;
  mgmt_fee_pct?: number | null; // e.g. 0.02
  mgmt_fee_basis?: "committed" | "deployed" | null;
  carry_pct?: number | null; // e.g. 0.20
  hurdle_pct?: number | null; // e.g. 0.08 (simple annual preferred return)
  waterfall_style?: "european" | "american" | null;
  catch_up?: "full" | "half" | "none" | null;
  created_at: string;
}

export interface Company {
  id: string;
  fund_brand_id: string;
  abbr: string | null;
  legal_name: string;
  brand_name: string | null;
  sector: string | null;
  hq_country: string | null;
  hq_city: string | null;
  website: string | null;
  logo_url: string | null;
  operating_currency: CurrencyCode;
  status: string; // active | exited | written_off
  latest_mark_price: number | null;
  latest_mark_price_date: string | null;
  last_priced_round_date: string | null;
  last_approved_post_money_local: number | null;
  last_approved_price_per_share: number | null;
  created_at: string;
  updated_at: string;
}

export interface Founder {
  id: string;
  company_id: string;
  name: string;
  role: string | null;
  background: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  is_primary: boolean;
  created_at: string;
}

export interface Deal {
  id: string;
  fund_id: string;
  company_id: string | null;
  stage: DealStage;
  source: DealSource | null;
  deal_owner_id: string | null;
  deal_owner: string | null;
  deal_lead: string | null;
  deal_lead_id: string | null;
  expected_investment: number | null;
  committed_amount: number | null;
  wired_amount: number | null;
  currency: CurrencyCode;
  expected_close_date: string | null;
  actual_close_date: string | null;
  is_first_investment: boolean | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Round {
  id: string;
  company_id: string;
  deal_id: string | null;
  round_name: string;
  round_date: string | null;
  our_role: string | null; // lead | co_invest | participant
  status: string; // active | closed | cancelled
  price_per_share: number | null;
  currency: CurrencyCode;
  pre_money_local: number | null;
  post_money_local: number | null;
  pre_money_fund: number | null;
  post_money_fund: number | null;
  fx_rate: number | null;
  old_total_shares: number | null;
  new_shares_issued: number | null;
  new_total_shares: number | null;
  thesis_summary: string | null;
  created_at: string;
}

export interface RoundInvestor {
  id: string;
  round_id: string;
  name: string;
  is_lead: boolean;
  amount_local: number | null;
  currency: CurrencyCode | null;
}

export interface TermSheet {
  id: string;
  deal_id: string;
  round_id: string | null;
  side: string; // ours | theirs
  status: TermSheetStatus;
  vehicle: InstrumentType;
  proposed_investment_local: number | null;
  currency: CurrencyCode;
  tentative_fx_rate: number | null;
  proposed_investment_fund: number | null;
  indicated_valuation_local: number | null;
  is_post_money: boolean;
  implied_price_per_share: number | null;
  rights_and_terms: Record<string, unknown> | null;
  round_name: string | null;
  moic_at_entry: number | null;
  signed_at: string | null;
  investment_lot_id: string | null;
  created_at: string;
}

export interface InvestmentLot {
  id: string;
  fund_id: string;
  company_id: string;
  round_id: string;
  deal_id: string | null;
  term_sheet_id: string | null;
  lot_sequence: number;
  code: string; // AIC-F2-SL-0001
  investment_date: string;
  transaction_type: string; // primary | follow_on | secondary
  vehicle: InstrumentType;
  shares_acquired: number | null;
  price_per_share_local: number;
  currency: CurrencyCode;
  cash_invested_local: number;
  /** Remaining cost basis (fund ccy) of shares still held; reduced on partial exit. */
  cash_invested_fund: number;
  /**
   * Total capital ever paid into this lot (fund ccy), immutable after entry.
   * This — not cash_invested_fund — is the DPI/TVPI/IRR denominator, so a
   * partial exit never shrinks committed/deployed capital. Optional for
   * backward compatibility; consumers fall back to cash_invested_fund.
   */
  paid_in_capital_fund?: number;
  fx_rate_at_entry: number;
  ownership_at_entry_pct: number | null;
  rights_and_terms: Record<string, unknown> | null;
  moic_on_prior_lot: number | null;
  overwrote_term_sheet: boolean;
  status: LotStatus;
  created_at: string;
  updated_at: string;
}

export interface ValuationMark {
  id: string;
  company_id: string;
  valuation_date: string;
  valuation_type: ValuationType;
  price_per_share_local: number;
  currency: CurrencyCode;
  pre_money_local: number | null;
  post_money_local: number | null;
  source: string | null;
  approval_status: ApprovalStatus;
  approved_by: string | null;
  notes: string | null;
  event_code: string | null;
  created_at: string;
}

export interface PositionSnapshot {
  id: string;
  lot_id: string;
  valuation_mark_id: string | null;
  snapshot_code: string;
  snapshot_date: string;
  as_converted_shares: number;
  ownership_pct_at_event: number | null;
  mark_price_per_share_local: number;
  currency: CurrencyCode;
  fx_rate_at_mark: number;
  mark_factor: number;
  fmv_local: number;
  fmv_fund: number;
  cost_basis_fund: number;
  unrealized_gain_loss_fund: number;
  moic_at_snapshot: number;
  notes: string | null;
  created_at: string;
}

/** transaction = lot entry FX (editable with cost basis); reporting = marks/NAV; manual = user override */
export type FxRatePurpose = "transaction" | "reporting" | "manual";

export interface FxRate {
  id: string;
  from_currency: CurrencyCode;
  to_currency: CurrencyCode;
  rate: number;
  rate_date: string;
  source: string | null;
  purpose?: FxRatePurpose;
}

export interface Realization {
  id: string;
  lot_id: string;
  company_id: string;
  realization_date: string;
  event_type: string; // partial_exit | full_exit | write_off | distribution
  shares_sold: number | null;
  price_per_share: number | null;
  gross_amount: number | null;
  net_amount: number | null;
  currency: CurrencyCode;
  fx_rate: number | null;
  notes: string | null;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  entity_type: string;
  entity_id: string;
  doc_type: string;
  file_url: string;
  file_name: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface DealStageHistory {
  id: string;
  deal_id: string;
  from_stage: DealStage | null;
  to_stage: DealStage;
  changed_by: string | null;
  changed_at: string;
  notes: string | null;
}

// ------------------------------------------------------------------
// The full relational dataset returned by the repository
// ------------------------------------------------------------------

export interface FundOSData {
  fundBrands: FundBrand[];
  funds: Fund[];
  companies: Company[];
  founders: Founder[];
  deals: Deal[];
  dealStageHistory: DealStageHistory[];
  rounds: Round[];
  roundInvestors: RoundInvestor[];
  termSheets: TermSheet[];
  investmentLots: InvestmentLot[];
  valuationMarks: ValuationMark[];
  positionSnapshots: PositionSnapshot[];
  fxRates: FxRate[];
  realizations: Realization[];
  documents: DocumentRow[];
}
