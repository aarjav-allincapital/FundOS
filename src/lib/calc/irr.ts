/**
 * Gross & Net IRR for a fund, computed as XIRR over irregularly-dated cash
 * flows (actual/365 day-count, Newton-Raphson with a bisection fallback).
 *
 *   Gross IRR: capital paid in (outflows) at each lot's investment date,
 *   realizations (inflows) at each realization date, plus current NAV as a
 *   residual inflow dated `asOf` — i.e. since-inception IRR with residual value.
 *
 *   Net IRR: gross flows minus modeled fund economics —
 *     • management fees: annual outflows on `mgmt_fee_pct` of the fee base
 *       (deployed capital, or committed when configured), pro-rated for the
 *       trailing partial year;
 *     • carried interest: crystallized at `asOf` as `carry_pct` of profit above
 *       return of capital plus a simple annual preferred return (`hurdle_pct`).
 *
 * This is an institutional-lite European-waterfall approximation: it does not
 * model a full LP-by-LP waterfall, capital-call timing, or GP catch-up.
 */

import type { Fund, FundOSData } from "@/lib/types";
import { allLotPositions } from "@/lib/calc/portfolio";
import { fundMetrics } from "@/lib/calc/fund";
import { convert } from "@/lib/calc/fx";

export interface CashFlow {
  date: string; // YYYY-MM-DD
  amount: number; // negative = outflow (contribution), positive = inflow (distribution/NAV)
}

export type WaterfallStyle = "european" | "american";
export type CatchUp = "full" | "half" | "none";

export interface FundEconomics {
  mgmtFeePct: number; // e.g. 0.02
  mgmtFeeBasis: "committed" | "deployed";
  carryPct: number; // e.g. 0.20
  hurdlePct: number; // e.g. 0.08 (simple annual preferred return)
  /** european = whole-fund (carry crystallized at asOf); american = deal-by-deal
   *  (carry taken at each realization date). */
  waterfallStyle: WaterfallStyle;
  /** How fully the GP catches up on the preferred return once the hurdle clears. */
  catchUp: CatchUp;
  committedCapitalFund?: number;
}

export const DEFAULT_ECONOMICS: FundEconomics = {
  mgmtFeePct: 0.02,
  mgmtFeeBasis: "deployed",
  carryPct: 0.2,
  hurdlePct: 0.08,
  waterfallStyle: "european",
  catchUp: "full",
};

const CATCH_UP_FRACTION: Record<CatchUp, number> = { full: 1, half: 0.5, none: 0 };

const MS_PER_DAY = 86_400_000;

function yearsBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / MS_PER_DAY / 365;
}

function addYears(date: string, years: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

interface TimedFlow {
  years: number;
  amount: number;
}

function npv(rate: number, flows: TimedFlow[]): number {
  let sum = 0;
  for (const f of flows) sum += f.amount / Math.pow(1 + rate, f.years);
  return sum;
}

function dNpv(rate: number, flows: TimedFlow[]): number {
  let sum = 0;
  for (const f of flows) sum += (-f.years * f.amount) / Math.pow(1 + rate, f.years + 1);
  return sum;
}

/**
 * Annualized internal rate of return (as a decimal, e.g. 0.25 = 25%).
 * Returns null when the flows can't yield a meaningful rate: fewer than two
 * non-zero flows, no sign change, non-finite inputs, or non-convergence.
 */
export function xirr(cashflows: CashFlow[]): number | null {
  const valid = cashflows.filter((c) => Number.isFinite(c.amount) && c.amount !== 0);
  if (valid.length < 2) return null;
  if (!valid.some((c) => c.amount > 0) || !valid.some((c) => c.amount < 0)) return null;

  const t0 = valid.reduce((min, c) => (c.date < min ? c.date : min), valid[0].date);
  const flows: TimedFlow[] = valid.map((c) => ({
    years: yearsBetween(t0, c.date),
    amount: c.amount,
  }));

  // Newton-Raphson from a 10% guess.
  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(rate, flows);
    const d = dNpv(rate, flows);
    if (!Number.isFinite(f) || !Number.isFinite(d) || d === 0) break;
    const next = rate - f / d;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - rate) < 1e-8) return round6(next);
    rate = next;
  }

  // Bisection fallback on [-99.99%, +10000%], needs a sign change to bracket a root.
  let lo = -0.9999;
  let hi = 100;
  let fLo = npv(lo, flows);
  const fHi = npv(hi, flows);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, flows);
    if (Math.abs(fMid) < 1e-7) return round6(mid);
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return round6((lo + hi) / 2);
}

function economicsForFund(fund: Fund, override?: Partial<FundEconomics>): FundEconomics {
  return {
    mgmtFeePct: override?.mgmtFeePct ?? fund.mgmt_fee_pct ?? DEFAULT_ECONOMICS.mgmtFeePct,
    mgmtFeeBasis:
      override?.mgmtFeeBasis ?? fund.mgmt_fee_basis ?? DEFAULT_ECONOMICS.mgmtFeeBasis,
    carryPct: override?.carryPct ?? fund.carry_pct ?? DEFAULT_ECONOMICS.carryPct,
    hurdlePct: override?.hurdlePct ?? fund.hurdle_pct ?? DEFAULT_ECONOMICS.hurdlePct,
    waterfallStyle:
      override?.waterfallStyle ?? fund.waterfall_style ?? DEFAULT_ECONOMICS.waterfallStyle,
    catchUp: override?.catchUp ?? fund.catch_up ?? DEFAULT_ECONOMICS.catchUp,
    committedCapitalFund:
      override?.committedCapitalFund ?? fund.committed_capital_fund ?? undefined,
  };
}

/** Realization proceeds for a fund (fund currency), one inflow per realization. */
function realizationInflows(data: FundOSData, fund: Fund): CashFlow[] {
  const lotIds = new Set(
    allLotPositions(data).filter((p) => p.fund.id === fund.id).map((p) => p.lot.id)
  );
  const flows: CashFlow[] = [];
  for (const r of data.realizations) {
    if (!lotIds.has(r.lot_id)) continue;
    const net = r.net_amount ?? 0;
    if (net === 0) continue;
    const inFund =
      r.currency === fund.currency
        ? net
        : convert(data.fxRates, net, r.currency, fund.currency, r.realization_date);
    flows.push({ date: r.realization_date, amount: inFund });
  }
  return flows;
}

/** Gross fund cash flows (fund currency): contributions, realizations, residual NAV. */
export function fundGrossCashFlows(
  data: FundOSData,
  fund: Fund,
  asOf: string
): CashFlow[] {
  const positions = allLotPositions(data).filter((p) => p.fund.id === fund.id);
  const flows: CashFlow[] = [];

  for (const p of positions) {
    if (p.paidInFund > 0) {
      flows.push({ date: p.lot.investment_date, amount: -p.paidInFund });
    }
  }

  flows.push(...realizationInflows(data, fund));

  const nav = fundMetrics(data, fund).currentNav;
  if (Number.isFinite(nav) && nav !== 0) {
    flows.push({ date: asOf, amount: nav });
  }

  return flows;
}

/** Net fund cash flows: gross minus modeled management fees and carried interest. */
export function fundNetCashFlows(
  data: FundOSData,
  fund: Fund,
  asOf: string,
  override?: Partial<FundEconomics>
): CashFlow[] {
  const gross = fundGrossCashFlows(data, fund, asOf);
  const econ = economicsForFund(fund, override);

  const positions = allLotPositions(data).filter((p) => p.fund.id === fund.id);
  const paidIn = positions.reduce((s, p) => s + p.paidInFund, 0);
  const metrics = fundMetrics(data, fund);
  const distributed = metrics.realizedProceeds + metrics.currentNav;

  const firstDate = gross.reduce((min, f) => (f.date < min ? f.date : min), asOf);
  const totalYears = Math.max(0, yearsBetween(firstDate, asOf));

  const flows: CashFlow[] = [...gross];

  // Management fees: whole-year charges on each anniversary + trailing stub.
  const feeBase =
    econ.mgmtFeeBasis === "committed"
      ? econ.committedCapitalFund ?? paidIn
      : paidIn;
  if (econ.mgmtFeePct > 0 && feeBase > 0) {
    const wholeYears = Math.floor(totalYears);
    for (let y = 1; y <= wholeYears; y++) {
      flows.push({ date: addYears(firstDate, y), amount: -econ.mgmtFeePct * feeBase });
    }
    const stub = totalYears - wholeYears;
    if (stub > 1e-9) {
      flows.push({ date: asOf, amount: -econ.mgmtFeePct * feeBase * stub });
    }
  }

  // Carried interest. Profit = distributions above paid-in capital. The GP
  // takes carry only once the preferred return (hurdle) is cleared; the
  // catch-up decides how much of that preferred is then added back into the
  // carry base (full = GP catches up on all of it; none = LP keeps it).
  if (econ.carryPct > 0 && Number.isFinite(distributed)) {
    const profit = distributed - paidIn;
    const preferred = paidIn * econ.hurdlePct * totalYears;
    const cleared = profit > preferred;
    const carryBase = cleared
      ? Math.max(0, profit - preferred * (1 - CATCH_UP_FRACTION[econ.catchUp]))
      : 0;
    const totalCarry = econ.carryPct * carryBase;

    if (totalCarry > 0) {
      if (econ.waterfallStyle === "american" && distributed > 0) {
        // Deal-by-deal: the realized share of carry is taken as deals exit;
        // the NAV-attributable share can't be taken until realized, so it
        // stays at asOf.
        for (const r of realizationInflows(data, fund)) {
          const share = r.amount / distributed;
          if (share > 0) flows.push({ date: r.date, amount: -totalCarry * share });
        }
        const navShare = metrics.currentNav / distributed;
        if (navShare > 0) flows.push({ date: asOf, amount: -totalCarry * navShare });
      } else {
        // European whole-fund: crystallized once at the measurement date.
        flows.push({ date: asOf, amount: -totalCarry });
      }
    }
  }

  return flows;
}

export interface FundIrrOptions {
  /** Valuation date for the residual NAV inflow. Defaults to today. */
  asOf?: string;
  /** Override the fund's stored economics (falls back to DEFAULT_ECONOMICS). */
  economics?: Partial<FundEconomics>;
}

export interface FundIrrResult {
  grossIrr: number | null;
  netIrr: number | null;
}

export function fundIrr(
  data: FundOSData,
  fund: Fund,
  options?: FundIrrOptions
): FundIrrResult {
  const asOf = options?.asOf ?? new Date().toISOString().slice(0, 10);
  return {
    grossIrr: xirr(fundGrossCashFlows(data, fund, asOf)),
    netIrr: xirr(fundNetCashFlows(data, fund, asOf, options?.economics)),
  };
}

export function allFundIrr(
  data: FundOSData,
  options?: FundIrrOptions
): Array<FundIrrResult & { fund: Fund }> {
  return data.funds.map((fund) => ({ fund, ...fundIrr(data, fund, options) }));
}
