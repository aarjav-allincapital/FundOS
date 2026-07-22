/**
 * In-place updates for existing records. Lot cost basis and transaction FX
 * are editable; snapshot edits recompute mark-to-market math.
 */

import type {
  ApprovalStatus,
  Company,
  Deal,
  DealSource,
  DealStage,
  Founder,
  FundOSData,
  InstrumentType,
  InvestmentLot,
  LotStatus,
  PositionSnapshot,
  ValuationMark,
  ValuationType,
} from "@/lib/types";
import { buildSnapshot } from "@/lib/calc/snapshot";
import { calcCashInvestedLocal } from "@/lib/calc/lot";
import { storeManualFxRate, storeTransactionFxRate } from "@/lib/data/fx-store";

function touchCompany(c: Company): Company {
  return { ...c, updated_at: new Date().toISOString() };
}

function touchDeal(d: Deal): Deal {
  return { ...d, updated_at: new Date().toISOString() };
}

function touchLot(l: InvestmentLot): InvestmentLot {
  return { ...l, updated_at: new Date().toISOString() };
}

// ------------------------------------------------------------------
// Company
// ------------------------------------------------------------------

export interface UpdateCompanyInput {
  id: string;
  legal_name?: string;
  brand_name?: string | null;
  sector?: string | null;
  hq_city?: string | null;
  hq_country?: string | null;
  operating_currency?: string;
  abbr?: string | null;
  status?: string;
  website?: string | null;
}

export function updateCompany(
  data: FundOSData,
  input: UpdateCompanyInput
): FundOSData {
  return {
    ...data,
    companies: data.companies.map((c) =>
      c.id === input.id
        ? touchCompany({
            ...c,
            legal_name: input.legal_name ?? c.legal_name,
            brand_name: input.brand_name !== undefined ? input.brand_name : c.brand_name,
            sector: input.sector !== undefined ? input.sector : c.sector,
            hq_city: input.hq_city !== undefined ? input.hq_city : c.hq_city,
            hq_country: input.hq_country !== undefined ? input.hq_country : c.hq_country,
            operating_currency: input.operating_currency ?? c.operating_currency,
            abbr: input.abbr !== undefined ? input.abbr : c.abbr,
            status: input.status ?? c.status,
            website: input.website !== undefined ? input.website : c.website,
          })
        : c
    ),
  };
}

// ------------------------------------------------------------------
// Founder
// ------------------------------------------------------------------

export interface UpdateFounderInput {
  id: string;
  company_id?: string;
  name?: string;
  role?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  is_primary?: boolean;
}

export function updateFounder(
  data: FundOSData,
  input: UpdateFounderInput
): FundOSData {
  return {
    ...data,
    founders: data.founders.map((f) =>
      f.id === input.id
        ? {
            ...f,
            company_id: input.company_id ?? f.company_id,
            name: input.name ?? f.name,
            role: input.role !== undefined ? input.role : f.role,
            email: input.email !== undefined ? input.email : f.email,
            linkedin_url:
              input.linkedin_url !== undefined ? input.linkedin_url : f.linkedin_url,
            is_primary: input.is_primary ?? f.is_primary,
          }
        : f
    ),
  };
}

// ------------------------------------------------------------------
// Deal
// ------------------------------------------------------------------

export interface UpdateDealInput {
  id: string;
  stage?: DealStage;
  source?: DealSource | null;
  deal_owner?: string | null;
  deal_lead?: string | null;
  expected_investment?: number | null;
  currency?: string;
  expected_close_date?: string | null;
  notes?: string | null;
}

export function updateDeal(data: FundOSData, input: UpdateDealInput): FundOSData {
  return {
    ...data,
    deals: data.deals.map((d) =>
      d.id === input.id
        ? touchDeal({
            ...d,
            stage: input.stage ?? d.stage,
            source: input.source !== undefined ? input.source : d.source,
            deal_owner: input.deal_owner !== undefined ? input.deal_owner : d.deal_owner,
            deal_lead: input.deal_lead !== undefined ? input.deal_lead : d.deal_lead,
            expected_investment:
              input.expected_investment !== undefined
                ? input.expected_investment
                : d.expected_investment,
            currency: input.currency ?? d.currency,
            expected_close_date:
              input.expected_close_date !== undefined
                ? input.expected_close_date
                : d.expected_close_date,
            notes: input.notes !== undefined ? input.notes : d.notes,
          })
        : d
    ),
  };
}

// ------------------------------------------------------------------
// Investment lot (cost basis + transaction FX are editable)
// ------------------------------------------------------------------

export interface UpdateLotInput {
  id: string;
  fund_id?: string;
  round_name?: string;
  vehicle?: InstrumentType;
  shares_acquired?: number | null;
  ownership_at_entry_pct?: number | null;
  status?: LotStatus;
  price_per_share_local?: number;
  cash_invested_local?: number;
  fx_rate_at_entry?: number;
  currency?: string;
  investment_date?: string;
}

export function updateInvestmentLot(
  data: FundOSData,
  input: UpdateLotInput
): FundOSData {
  const lot = data.investmentLots.find((l) => l.id === input.id);
  if (!lot) return data;

  const fundId = input.fund_id ?? lot.fund_id;
  const currency = input.currency ?? lot.currency;
  const shares =
    input.shares_acquired !== undefined ? input.shares_acquired : lot.shares_acquired;
  const pricePerShare =
    input.price_per_share_local !== undefined
      ? input.price_per_share_local
      : lot.price_per_share_local;
  const cashLocal = calcCashInvestedLocal(shares, pricePerShare);
  const fx =
    input.fx_rate_at_entry !== undefined
      ? input.fx_rate_at_entry
      : lot.fx_rate_at_entry;
  const cashFund = cashLocal * fx;

  const updatedLot = touchLot({
    ...lot,
    fund_id: fundId,
    vehicle: input.vehicle ?? lot.vehicle,
    shares_acquired: shares,
    ownership_at_entry_pct:
      input.ownership_at_entry_pct !== undefined
        ? input.ownership_at_entry_pct
        : lot.ownership_at_entry_pct,
    status: input.status ?? lot.status,
    price_per_share_local: pricePerShare,
    cash_invested_local: cashLocal,
    cash_invested_fund: cashFund,
    fx_rate_at_entry: fx,
    currency,
    investment_date: input.investment_date ?? lot.investment_date,
  });

  let rounds = data.rounds;
  if (input.round_name && lot.round_id) {
    rounds = data.rounds.map((r) =>
      r.id === lot.round_id
        ? {
            ...r,
            round_name: input.round_name!,
            price_per_share:
              input.price_per_share_local !== undefined
                ? input.price_per_share_local
                : r.price_per_share,
            currency,
            fx_rate: fx,
          }
        : r
    );
  }

  const deals =
    input.fund_id && lot.deal_id
      ? data.deals.map((d) =>
          d.id === lot.deal_id ? touchDeal({ ...d, fund_id: fundId }) : d
        )
      : data.deals;

  let working: FundOSData = {
    ...data,
    investmentLots: data.investmentLots.map((l) =>
      l.id === input.id ? updatedLot : l
    ),
    rounds,
    deals,
  };

  const fund = working.funds.find((f) => f.id === updatedLot.fund_id);
  if (fund && currency !== fund.currency) {
    working = storeTransactionFxRate(
      working,
      currency,
      fund.currency,
      fx,
      updatedLot.investment_date,
      "manual"
    );
  }

  // Rebuild all snapshots for this lot so cost basis / entry FX stay consistent.
  const lotSnaps = working.positionSnapshots.filter((s) => s.lot_id === lot.id);
  const rebuilt = lotSnaps.map((existing) => {
    const wasEntry =
      existing.snapshot_date === lot.investment_date ||
      existing.notes === "Entry basis";
    const snapDate = wasEntry ? updatedLot.investment_date : existing.snapshot_date;
    const isEntry = wasEntry || existing.snapshot_date === updatedLot.investment_date;
    const snap = buildSnapshot({
      lot: updatedLot,
      snapshot_date: snapDate,
      mark_price_per_share_local: isEntry
        ? updatedLot.price_per_share_local
        : existing.mark_price_per_share_local,
      fx_rate_at_mark: isEntry ? fx : existing.fx_rate_at_mark,
      as_converted_shares: isEntry
        ? updatedLot.shares_acquired ?? existing.as_converted_shares
        : existing.as_converted_shares,
      ownership_pct_at_event: existing.ownership_pct_at_event,
      valuation_mark_id: existing.valuation_mark_id,
      notes: existing.notes,
      currency: updatedLot.currency,
    });
    return {
      ...snap,
      id: existing.id,
      snapshot_code: existing.snapshot_code,
      created_at: existing.created_at,
    } satisfies PositionSnapshot;
  });

  return {
    ...working,
    positionSnapshots: working.positionSnapshots.map(
      (s) => rebuilt.find((r) => r.id === s.id) ?? s
    ),
  };
}

// ------------------------------------------------------------------
// Valuation mark
// ------------------------------------------------------------------

export interface UpdateValuationMarkInput {
  id: string;
  valuation_date?: string;
  valuation_type?: ValuationType;
  price_per_share_local?: number;
  post_money_local?: number | null;
  approval_status?: ApprovalStatus;
  notes?: string | null;
}

export function updateValuationMark(
  data: FundOSData,
  input: UpdateValuationMarkInput
): FundOSData {
  return {
    ...data,
    valuationMarks: data.valuationMarks.map((m) =>
      m.id === input.id
        ? {
            ...m,
            valuation_date: input.valuation_date ?? m.valuation_date,
            valuation_type: input.valuation_type ?? m.valuation_type,
            price_per_share_local:
              input.price_per_share_local ?? m.price_per_share_local,
            post_money_local:
              input.post_money_local !== undefined
                ? input.post_money_local
                : m.post_money_local,
            approval_status: input.approval_status ?? m.approval_status,
            notes: input.notes !== undefined ? input.notes : m.notes,
          }
        : m
    ),
  };
}

// ------------------------------------------------------------------
// Position snapshot
// ------------------------------------------------------------------

export interface UpdateSnapshotInput {
  id: string;
  snapshot_date?: string;
  mark_price_per_share_local?: number;
  as_converted_shares?: number;
  notes?: string | null;
}

export function updatePositionSnapshot(
  data: FundOSData,
  input: UpdateSnapshotInput
): FundOSData {
  const existing = data.positionSnapshots.find((s) => s.id === input.id);
  if (!existing) return data;

  const lot = data.investmentLots.find((l) => l.id === existing.lot_id);
  if (!lot) return data;

  const snap = buildSnapshot({
    lot,
    snapshot_date: input.snapshot_date ?? existing.snapshot_date,
    mark_price_per_share_local:
      input.mark_price_per_share_local ?? existing.mark_price_per_share_local,
    fx_rate_at_mark: existing.fx_rate_at_mark,
    as_converted_shares:
      input.as_converted_shares ?? existing.as_converted_shares,
    ownership_pct_at_event: existing.ownership_pct_at_event,
    valuation_mark_id: existing.valuation_mark_id,
    notes: input.notes !== undefined ? input.notes : existing.notes,
  });

  const rebuilt: PositionSnapshot = {
    ...snap,
    id: existing.id,
    snapshot_code: existing.snapshot_code,
    created_at: existing.created_at,
  };

  return {
    ...data,
    positionSnapshots: data.positionSnapshots.map((s) =>
      s.id === input.id ? rebuilt : s
    ),
  };
}

// ------------------------------------------------------------------
// FX rate (manual reporting rows only)
// ------------------------------------------------------------------

export interface UpdateFxRateInput {
  id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  rate_date: string;
}

export function updateFxRate(data: FundOSData, input: UpdateFxRateInput): FundOSData {
  const row = data.fxRates.find((r) => r.id === input.id);
  if (!row) return data;

  if (row.purpose === "transaction") {
    const without: FundOSData = {
      ...data,
      fxRates: data.fxRates.filter((r) => r.id !== input.id),
    };
    return storeTransactionFxRate(
      without,
      input.from_currency,
      input.to_currency,
      input.rate,
      input.rate_date,
      "manual"
    );
  }

  return replaceManualFxRate(data, input);
}

function replaceManualFxRate(
  data: FundOSData,
  input: UpdateFxRateInput
): FundOSData {
  const without: FundOSData = {
    ...data,
    fxRates: data.fxRates.filter((r) => r.id !== input.id),
  };
  return storeManualFxRate(
    without,
    input.from_currency,
    input.to_currency,
    input.rate,
    input.rate_date
  );
}

// ------------------------------------------------------------------
// Fund (metadata + economics that drive Net IRR)
// ------------------------------------------------------------------

export interface UpdateFundInput {
  id: string;
  name?: string;
  vintage_year?: number | null;
  status?: string;
  committed_capital_fund?: number | null;
  mgmt_fee_pct?: number | null;
  mgmt_fee_basis?: "committed" | "deployed" | null;
  carry_pct?: number | null;
  hurdle_pct?: number | null;
  waterfall_style?: "european" | "american" | null;
  catch_up?: "full" | "half" | "none" | null;
}

export function updateFund(data: FundOSData, input: UpdateFundInput): FundOSData {
  return {
    ...data,
    funds: data.funds.map((f) =>
      f.id === input.id
        ? {
            ...f,
            name: input.name ?? f.name,
            vintage_year:
              input.vintage_year !== undefined ? input.vintage_year : f.vintage_year,
            status: input.status ?? f.status,
            committed_capital_fund:
              input.committed_capital_fund !== undefined
                ? input.committed_capital_fund
                : f.committed_capital_fund,
            mgmt_fee_pct:
              input.mgmt_fee_pct !== undefined ? input.mgmt_fee_pct : f.mgmt_fee_pct,
            mgmt_fee_basis:
              input.mgmt_fee_basis !== undefined
                ? input.mgmt_fee_basis
                : f.mgmt_fee_basis,
            carry_pct: input.carry_pct !== undefined ? input.carry_pct : f.carry_pct,
            hurdle_pct:
              input.hurdle_pct !== undefined ? input.hurdle_pct : f.hurdle_pct,
            waterfall_style:
              input.waterfall_style !== undefined ? input.waterfall_style : f.waterfall_style,
            catch_up: input.catch_up !== undefined ? input.catch_up : f.catch_up,
          }
        : f
    ),
  };
}
