/**
 * Portfolio-level derivations. Everything is computed from base tables;
 * nothing is read from denormalized/cached columns for correctness.
 */

import type {
  Company,
  Fund,
  FundOSData,
  InvestmentLot,
  PositionSnapshot,
  Round,
  ValuationMark,
} from "@/lib/types";

export interface LotPosition {
  lot: InvestmentLot;
  fund: Fund;
  company: Company;
  round: Round | null;
  latest: PositionSnapshot | null;
  previous: PositionSnapshot | null;
  /** Total capital paid into this lot (fund ccy); never shrinks on partial exit. */
  paidInFund: number;
  /** Remaining cost basis (fund ccy) of shares still held. */
  costBasisFund: number;
  fmvFund: number;
  unrealizedFund: number;
  moic: number;
  /** period-over-period change in FMV (fund ccy) vs previous snapshot */
  markChangePct: number | null;
}

/** All snapshots for a lot, newest first. */
export function snapshotsForLot(
  data: Pick<FundOSData, "positionSnapshots">,
  lotId: string
): PositionSnapshot[] {
  return data.positionSnapshots
    .filter((s) => s.lot_id === lotId)
    .sort((a, b) => (a.snapshot_date < b.snapshot_date ? 1 : -1));
}

/**
 * Build the current position for a single lot (mirrors v_lot_current).
 * Returns null when the lot references a fund/company that no longer exists,
 * so one orphaned row can't crash the whole portfolio derivation.
 */
export function buildLotPosition(
  data: FundOSData,
  lot: InvestmentLot
): LotPosition | null {
  const fund = data.funds.find((f) => f.id === lot.fund_id);
  const company = data.companies.find((c) => c.id === lot.company_id);
  if (!fund || !company) return null;
  const round = data.rounds.find((r) => r.id === lot.round_id) ?? null;
  const snaps = snapshotsForLot(data, lot.id);
  const latest = snaps[0] ?? null;
  const previous = snaps[1] ?? null;

  const paidInFund = lot.paid_in_capital_fund ?? lot.cash_invested_fund;
  const costBasisFund = latest?.cost_basis_fund ?? lot.cash_invested_fund;
  const fmvFund = latest?.fmv_fund ?? lot.cash_invested_fund;
  const unrealizedFund = latest?.unrealized_gain_loss_fund ?? 0;
  const moic = latest?.moic_at_snapshot ?? (costBasisFund > 0 ? fmvFund / costBasisFund : 0);

  let markChangePct: number | null = null;
  if (latest && previous && previous.fmv_fund !== 0) {
    markChangePct = ((latest.fmv_fund - previous.fmv_fund) / previous.fmv_fund) * 100;
  }

  return {
    lot,
    fund,
    company,
    round,
    latest,
    previous,
    paidInFund,
    costBasisFund,
    fmvFund,
    unrealizedFund,
    moic,
    markChangePct,
  };
}

export function allLotPositions(data: FundOSData): LotPosition[] {
  return data.investmentLots
    .map((lot) => buildLotPosition(data, lot))
    .filter((p): p is LotPosition => p !== null);
}

export interface CompanyRollup {
  company: Company;
  lots: LotPosition[];
  funds: Fund[];
  activeRounds: number;
  totalLots: number;
  /** Aggregates are per-fund-currency; only sum within a fund for correctness. */
  costByCurrency: Record<string, number>;
  fmvByCurrency: Record<string, number>;
  unrealizedByCurrency: Record<string, number>;
  blendedMoic: number;
  latestMarkDate: string | null;
  status: string;
}

export function companyRollup(data: FundOSData, company: Company): CompanyRollup {
  const lots = allLotPositions(data).filter((p) => p.company.id === company.id);
  const funds = uniqueBy(lots.map((l) => l.fund), (f) => f.id);
  const activeRounds = data.rounds.filter(
    (r) => r.company_id === company.id && r.status === "active"
  ).length;

  const costByCurrency: Record<string, number> = {};
  const fmvByCurrency: Record<string, number> = {};
  const unrealizedByCurrency: Record<string, number> = {};

  for (const p of lots) {
    const ccy = p.fund.currency;
    costByCurrency[ccy] = (costByCurrency[ccy] ?? 0) + p.costBasisFund;
    fmvByCurrency[ccy] = (fmvByCurrency[ccy] ?? 0) + p.fmvFund;
    unrealizedByCurrency[ccy] =
      (unrealizedByCurrency[ccy] ?? 0) + p.unrealizedFund;
  }

  const totalCost = lots.reduce((s, p) => s + p.costBasisFund, 0);
  const totalFmv = lots.reduce((s, p) => s + p.fmvFund, 0);
  const blendedMoic = totalCost > 0 ? totalFmv / totalCost : 0;

  const latestMarkDate =
    lots
      .map((l) => l.latest?.snapshot_date)
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? null;

  return {
    company,
    lots,
    funds,
    activeRounds,
    totalLots: lots.length,
    costByCurrency,
    fmvByCurrency,
    unrealizedByCurrency,
    blendedMoic,
    latestMarkDate,
    status: company.status,
  };
}

export function allCompanyRollups(data: FundOSData): CompanyRollup[] {
  return data.companies
    .map((c) => companyRollup(data, c))
    .filter((r) => r.totalLots > 0)
    .sort((a, b) => {
      const av = sumValues(a.fmvByCurrency);
      const bv = sumValues(b.fmvByCurrency);
      return bv - av;
    });
}

/** Most recent valuation marks across the portfolio, newest first. */
export function recentValuationMarks(
  data: FundOSData,
  limit = 8
): Array<ValuationMark & { company: Company }> {
  return data.valuationMarks
    .map((m) => {
      const company = data.companies.find((c) => c.id === m.company_id);
      return company ? { ...m, company } : null;
    })
    .filter((m): m is ValuationMark & { company: Company } => m !== null)
    .sort((a, b) => (a.valuation_date < b.valuation_date ? 1 : -1))
    .slice(0, limit);
}

// helpers
function uniqueBy<T>(arr: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

export function sumValues(rec: Record<string, number>): number {
  return Object.values(rec).reduce((s, v) => s + v, 0);
}
