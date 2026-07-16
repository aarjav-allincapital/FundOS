/**
 * Client-side mutations. All writes go through here so snapshot math and
 * company cache stay consistent before persisting to localStorage.
 */

import type {
  Company,
  Deal,
  Founder,
  FundOSData,
  InvestmentLot,
  InstrumentType,
  PositionSnapshot,
  ValuationMark,
  ValuationType,
  DealStage,
  DealSource,
} from "@/lib/types";
import { buildSnapshot } from "@/lib/calc/snapshot";
import { calcCashInvestedLocal } from "@/lib/calc/lot";
import { resolveFxRate } from "@/lib/calc/fx";
import { suggestCompanyAbbr } from "@/lib/calc/abbr";
import { FUND_BRAND_ID } from "@/lib/data/bootstrap";
import {
  storeManualFxRate,
  storeReportingFxRate,
  storeTransactionFxRate,
} from "@/lib/data/fx-store";
import { pairKey } from "@/lib/fx/prepare";

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function generateAbbr(name: string, existing: string[]): string {
  const abbr = suggestCompanyAbbr(name);
  let candidate = abbr;
  let n = 2;
  while (existing.includes(candidate)) {
    candidate = `${abbr.slice(0, 3)}${n}`;
    n++;
  }
  return candidate;
}

function lotCode(
  data: FundOSData,
  fundId: string,
  companyAbbr: string,
  sequence: number
): string {
  const fund = data.funds.find((f) => f.id === fundId)!;
  const brand = data.fundBrands.find((b) => b.id === fund.fund_brand_id)!;
  return `${brand.abbr}-${fund.vehicle_code}-${companyAbbr}-${String(sequence).padStart(4, "0")}`;
}

// ------------------------------------------------------------------
// Company (entered once)
// ------------------------------------------------------------------

export interface AddCompanyInput {
  legal_name: string;
  brand_name?: string;
  sector?: string;
  hq_city?: string;
  hq_country?: string;
  operating_currency: string;
  abbr?: string;
}

export function addCompany(data: FundOSData, input: AddCompanyInput): FundOSData {
  const existingAbbrs = data.companies.map((c) => c.abbr).filter(Boolean) as string[];
  const abbr =
    input.abbr?.toUpperCase() ||
    generateAbbr(input.brand_name || input.legal_name, existingAbbrs);
  const company: Company = {
    id: id("co"),
    fund_brand_id: FUND_BRAND_ID,
    abbr,
    legal_name: input.legal_name,
    brand_name: input.brand_name ?? null,
    sector: input.sector ?? null,
    hq_country: input.hq_country ?? null,
    hq_city: input.hq_city ?? null,
    website: null,
    operating_currency: input.operating_currency,
    status: "active",
    latest_mark_price: null,
    latest_mark_price_date: null,
    last_priced_round_date: null,
    last_approved_post_money_local: null,
    last_approved_price_per_share: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return { ...data, companies: [...data.companies, company] };
}

// ------------------------------------------------------------------
// Founder
// ------------------------------------------------------------------

export interface AddFounderInput {
  company_id: string;
  name: string;
  role?: string;
  email?: string;
  linkedin_url?: string;
  is_primary?: boolean;
}

export function addFounder(data: FundOSData, input: AddFounderInput): FundOSData {
  const founder: Founder = {
    id: id("founder"),
    company_id: input.company_id,
    name: input.name,
    role: input.role ?? null,
    background: null,
    email: input.email ?? null,
    phone: null,
    linkedin_url: input.linkedin_url ?? null,
    is_primary: input.is_primary ?? false,
    created_at: new Date().toISOString(),
  };
  return { ...data, founders: [...data.founders, founder] };
}

// ------------------------------------------------------------------
// Investment lot
// ------------------------------------------------------------------

export interface AddLotInput {
  fund_id: string;
  company_id: string;
  round_name: string;
  investment_date: string;
  vehicle: InstrumentType;
  shares_acquired: number;
  price_per_share_local: number;
  currency: string;
  cash_invested_local: number;
  fx_rate_at_entry?: number;
  ownership_at_entry_pct?: number;
  our_role?: string;
}

export function addInvestmentLot(data: FundOSData, input: AddLotInput): FundOSData {
  const company = data.companies.find((c) => c.id === input.company_id);
  const fund = data.funds.find((f) => f.id === input.fund_id);
  if (!company || !fund) return data;

  const fx =
    input.fx_rate_at_entry ??
    (input.currency === fund.currency
      ? 1
      : resolveFxRate(
          data.fxRates,
          input.currency,
          fund.currency,
          input.investment_date,
          { purposes: ["reporting", "manual"] }
        ).rate);

  let working = data;
  if (input.currency !== fund.currency) {
    working = storeTransactionFxRate(
      working,
      input.currency,
      fund.currency,
      fx,
      input.investment_date
    );
  }

  const cashLocal = calcCashInvestedLocal(
    input.shares_acquired,
    input.price_per_share_local
  );
  const cashFund = cashLocal * fx;
  const existingLots = data.investmentLots.filter(
    (l) => l.fund_id === input.fund_id && l.company_id === input.company_id
  );
  const sequence = existingLots.length + 1;
  const code = lotCode(data, input.fund_id, company.abbr!, sequence);

  const deal: Deal = {
    id: id("deal"),
    fund_id: input.fund_id,
    company_id: input.company_id,
    stage: "post_investment",
    source: "internal_lead" as DealSource,
    deal_owner_id: null,
    deal_owner: null,
    deal_lead: null,
    deal_lead_id: null,
    expected_investment: cashLocal,
    committed_amount: cashLocal,
    wired_amount: cashLocal,
    currency: input.currency,
    expected_close_date: input.investment_date,
    actual_close_date: input.investment_date,
    is_first_investment: existingLots.length === 0,
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const roundId = id("round");
  const round = {
    id: roundId,
    company_id: input.company_id,
    deal_id: deal.id,
    round_name: input.round_name,
    round_date: input.investment_date,
    our_role: input.our_role ?? "lead",
    status: "active",
    price_per_share: input.price_per_share_local,
    currency: input.currency,
    pre_money_local: null,
    post_money_local: null,
    pre_money_fund: null,
    post_money_fund: null,
    fx_rate: fx,
    old_total_shares: null,
    new_shares_issued: input.shares_acquired,
    new_total_shares: null,
    thesis_summary: null,
    created_at: new Date().toISOString(),
  };

  const lot: InvestmentLot = {
    id: id("lot"),
    fund_id: input.fund_id,
    company_id: input.company_id,
    round_id: roundId,
    deal_id: deal.id,
    term_sheet_id: null,
    lot_sequence: sequence,
    code,
    investment_date: input.investment_date,
    transaction_type: "primary",
    vehicle: input.vehicle,
    shares_acquired: input.shares_acquired,
    price_per_share_local: input.price_per_share_local,
    currency: input.currency,
    cash_invested_local: cashLocal,
    cash_invested_fund: cashFund,
    paid_in_capital_fund: cashFund,
    fx_rate_at_entry: fx,
    ownership_at_entry_pct: input.ownership_at_entry_pct ?? null,
    rights_and_terms: null,
    moic_on_prior_lot: null,
    overwrote_term_sheet: false,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const entrySnap = buildSnapshot({
    lot,
    snapshot_date: input.investment_date,
    mark_price_per_share_local: input.price_per_share_local,
    fx_rate_at_mark: fx,
    as_converted_shares: input.shares_acquired,
    ownership_pct_at_event: input.ownership_at_entry_pct,
    notes: "Entry basis",
  });

  return {
    ...working,
    deals: [...working.deals, deal],
    rounds: [...working.rounds, round],
    investmentLots: [...working.investmentLots, lot],
    positionSnapshots: [...working.positionSnapshots, entrySnap],
  };
}

// ------------------------------------------------------------------
// Valuation mark + fan-out snapshots
// ------------------------------------------------------------------

export interface AddValuationMarkInput {
  company_id: string;
  valuation_date: string;
  valuation_type: ValuationType;
  price_per_share_local: number;
  post_money_local?: number;
  approval_status?: "draft" | "pending" | "approved";
  /** Pre-fetched reporting FX keyed by "FROM>TO" */
  reporting_fx?: Record<string, number>;
}

export function addValuationMark(
  data: FundOSData,
  input: AddValuationMarkInput
): FundOSData {
  const company = data.companies.find((c) => c.id === input.company_id);
  if (!company) return data;

  const mark: ValuationMark = {
    id: id("mark"),
    company_id: input.company_id,
    valuation_date: input.valuation_date,
    valuation_type: input.valuation_type,
    price_per_share_local: input.price_per_share_local,
    currency: company.operating_currency,
    pre_money_local: null,
    post_money_local: input.post_money_local ?? null,
    source: "internal",
    approval_status: input.approval_status ?? "approved",
    approved_by: null,
    notes: null,
    event_code: `VE-${company.abbr}-${input.valuation_date}`,
    created_at: new Date().toISOString(),
  };

  // Partially-exited lots still hold a live position, so they must be repriced
  // by new company marks too — otherwise their NAV freezes at the exit-date mark.
  const activeLots = data.investmentLots.filter(
    (l) =>
      l.company_id === input.company_id &&
      (l.status === "active" || l.status === "partial_exit")
  );

  const newSnaps: PositionSnapshot[] = [];
  let working = data;
  for (const lot of activeLots) {
    const fund = data.funds.find((f) => f.id === lot.fund_id)!;
    const key = pairKey(company.operating_currency, fund.currency);
    const fx =
      company.operating_currency === fund.currency
        ? 1
        : (input.reporting_fx?.[key] ??
          resolveFxRate(
            working.fxRates,
            company.operating_currency,
            fund.currency,
            input.valuation_date,
            { purposes: ["reporting", "manual"] }
          ).rate);

    if (company.operating_currency !== fund.currency && input.reporting_fx?.[key]) {
      working = storeReportingFxRate(
        working,
        company.operating_currency,
        fund.currency,
        fx,
        input.valuation_date
      );
    }

    const snap = buildSnapshot({
      lot,
      snapshot_date: input.valuation_date,
      mark_price_per_share_local: input.price_per_share_local,
      fx_rate_at_mark: fx,
      as_converted_shares: lot.shares_acquired ?? 0,
      ownership_pct_at_event: lot.ownership_at_entry_pct,
      valuation_mark_id: mark.id,
      notes: `Mark @ ${input.valuation_date}`,
    });
    newSnaps.push(snap);
  }

  const updatedCompanies = data.companies.map((c) =>
    c.id === input.company_id && mark.approval_status === "approved"
      ? {
          ...c,
          latest_mark_price: input.price_per_share_local,
          latest_mark_price_date: input.valuation_date,
          last_approved_price_per_share: input.price_per_share_local,
          last_approved_post_money_local: input.post_money_local ?? c.last_approved_post_money_local,
          last_priced_round_date: input.valuation_date,
          updated_at: new Date().toISOString(),
        }
      : c
  );

  const filteredSnaps = data.positionSnapshots.filter(
    (s) =>
      !newSnaps.some(
        (ns) => ns.lot_id === s.lot_id && ns.snapshot_date === s.snapshot_date
      )
  );

  return {
    ...working,
    companies: updatedCompanies,
    valuationMarks: [...working.valuationMarks, mark],
    positionSnapshots: [...filteredSnaps, ...newSnaps],
  };
}

// ------------------------------------------------------------------
// Position snapshot (manual, per lot)
// ------------------------------------------------------------------

export interface AddSnapshotInput {
  lot_id: string;
  snapshot_date: string;
  mark_price_per_share_local: number;
  as_converted_shares?: number;
  ownership_pct_at_event?: number;
  notes?: string;
  /** Pre-fetched reporting FX for lot ccy → fund ccy */
  reporting_fx_rate?: number;
}

export function addPositionSnapshot(
  data: FundOSData,
  input: AddSnapshotInput
): FundOSData {
  const lot = data.investmentLots.find((l) => l.id === input.lot_id);
  if (!lot) return data;
  const fund = data.funds.find((f) => f.id === lot.fund_id)!;
  const fx =
    lot.currency === fund.currency
      ? 1
      : (input.reporting_fx_rate ??
        resolveFxRate(
          data.fxRates,
          lot.currency,
          fund.currency,
          input.snapshot_date,
          { purposes: ["reporting", "manual"] }
        ).rate);

  let working = data;
  if (lot.currency !== fund.currency && input.reporting_fx_rate != null) {
    working = storeReportingFxRate(
      working,
      lot.currency,
      fund.currency,
      fx,
      input.snapshot_date
    );
  }

  const snap = buildSnapshot({
    lot,
    snapshot_date: input.snapshot_date,
    mark_price_per_share_local: input.mark_price_per_share_local,
    fx_rate_at_mark: fx,
    as_converted_shares: input.as_converted_shares,
    ownership_pct_at_event: input.ownership_pct_at_event,
    notes: input.notes,
  });

  const filtered = data.positionSnapshots.filter(
    (s) => !(s.lot_id === snap.lot_id && s.snapshot_date === snap.snapshot_date)
  );

  return { ...working, positionSnapshots: [...filtered, snap] };
}

// ------------------------------------------------------------------
// Deal (pipeline)
// ------------------------------------------------------------------

export interface AddDealInput {
  fund_id: string;
  company_name: string;
  stage: DealStage;
  source: DealSource;
  deal_owner?: string;
  deal_lead?: string;
  expected_investment: number;
  currency: string;
  expected_close_date?: string;
}

export function addDeal(data: FundOSData, input: AddDealInput): FundOSData {
  const deal: Deal = {
    id: id("deal"),
    fund_id: input.fund_id,
    company_id: null,
    stage: input.stage,
    source: input.source,
    deal_owner_id: null,
    deal_owner: input.deal_owner ?? null,
    deal_lead: input.deal_lead ?? null,
    deal_lead_id: null,
    expected_investment: input.expected_investment,
    committed_amount: null,
    wired_amount: null,
    currency: input.currency,
    expected_close_date: input.expected_close_date ?? null,
    actual_close_date: null,
    is_first_investment: true,
    notes: `${input.company_name} — prospective investment`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return { ...data, deals: [...data.deals, deal] };
}

// ------------------------------------------------------------------
// FX rate
// ------------------------------------------------------------------

export interface AddFxRateInput {
  from_currency: string;
  to_currency: string;
  rate: number;
  rate_date: string;
  source?: string;
}

export function addFxRate(data: FundOSData, input: AddFxRateInput): FundOSData {
  return storeManualFxRate(
    data,
    input.from_currency,
    input.to_currency,
    input.rate,
    input.rate_date,
    input.source ?? "manual"
  );
}

// ------------------------------------------------------------------
// Exit / realization (partial exit, full exit, write-off)
// ------------------------------------------------------------------

export interface ExitLotInput {
  lot_id: string;
  realization_date: string;
  event_type: "partial_exit" | "full_exit" | "write_off";
  shares_sold?: number;
  price_per_share?: number;
  notes?: string;
  /** Pre-fetched FX (lot ccy → fund ccy) for the realization date. */
  fx_rate?: number;
}

export function exitLot(data: FundOSData, input: ExitLotInput): FundOSData {
  const lot = data.investmentLots.find((l) => l.id === input.lot_id);
  if (!lot) return data;
  const fund = data.funds.find((f) => f.id === lot.fund_id);
  if (!fund) return data;

  const isWriteOff = input.event_type === "write_off";
  const pricePerShare = isWriteOff ? 0 : input.price_per_share ?? 0;
  const sharesSold = isWriteOff
    ? lot.shares_acquired ?? 0
    : input.shares_sold ?? lot.shares_acquired ?? 0;

  const grossLocal = pricePerShare * sharesSold;

  const fx =
    lot.currency === fund.currency
      ? 1
      : (input.fx_rate ??
        resolveFxRate(
          data.fxRates,
          lot.currency,
          fund.currency,
          input.realization_date,
          { purposes: ["reporting", "manual"] }
        ).rate);

  let working = data;
  if (lot.currency !== fund.currency && input.fx_rate != null) {
    working = storeReportingFxRate(
      working,
      lot.currency,
      fund.currency,
      fx,
      input.realization_date
    );
  }

  const realization = {
    id: id("real"),
    lot_id: lot.id,
    company_id: lot.company_id,
    realization_date: input.realization_date,
    event_type: input.event_type,
    shares_sold: sharesSold,
    price_per_share: pricePerShare,
    gross_amount: grossLocal,
    net_amount: grossLocal,
    currency: lot.currency,
    fx_rate: fx,
    notes: input.notes ?? null,
    created_at: new Date().toISOString(),
  };

  const totalShares = lot.shares_acquired ?? 0;
  const isFull =
    isWriteOff || input.event_type === "full_exit" || sharesSold >= totalShares;
  const newStatus = isWriteOff
    ? "written_off"
    : isFull
      ? "full_exit"
      : "partial_exit";

  // For a partial exit, the sold portion's cost basis leaves the lot so the
  // remaining position (and its NAV) reflects only the shares still held —
  // otherwise NAV would double-count shares already sold.
  let updatedLot: InvestmentLot = {
    ...lot,
    status: newStatus as InvestmentLot["status"],
    updated_at: new Date().toISOString(),
  };

  let snapshots = working.positionSnapshots;

  if (newStatus === "partial_exit" && totalShares > 0) {
    const remainingShares = totalShares - sharesSold;
    const remainingFrac = remainingShares / totalShares;
    updatedLot = {
      ...updatedLot,
      shares_acquired: remainingShares,
      cash_invested_local: lot.cash_invested_local * remainingFrac,
      cash_invested_fund: lot.cash_invested_fund * remainingFrac,
    };

    // Rebuild this lot's snapshots against the reduced share count / cost.
    snapshots = working.positionSnapshots.map((s) => {
      if (s.lot_id !== lot.id) return s;
      const rebuilt = buildSnapshot({
        lot: updatedLot,
        snapshot_date: s.snapshot_date,
        mark_price_per_share_local: s.mark_price_per_share_local,
        fx_rate_at_mark: s.fx_rate_at_mark,
        as_converted_shares: remainingShares,
        ownership_pct_at_event: s.ownership_pct_at_event,
        valuation_mark_id: s.valuation_mark_id,
        notes: s.notes,
        currency: s.currency,
      });
      return { ...rebuilt, id: s.id, snapshot_code: s.snapshot_code, created_at: s.created_at };
    });
  }

  const updatedLots = working.investmentLots.map((l) =>
    l.id === lot.id ? updatedLot : l
  );

  return {
    ...working,
    investmentLots: updatedLots,
    positionSnapshots: snapshots,
    realizations: [...working.realizations, realization],
  };
}
