/**
 * Calculation engine barrel + top-level portfolio selectors.
 * Components import from here; they never compute financials inline.
 */

export * from "@/lib/calc/formatters";
export * from "@/lib/calc/lot";
export * from "@/lib/calc/abbr";
export * from "@/lib/calc/fx";
export * from "@/lib/calc/snapshot";
export * from "@/lib/calc/portfolio";
export * from "@/lib/calc/fund";
export * from "@/lib/calc/pipeline";
export * from "@/lib/calc/trends";

import type { CurrencyCode, FundOSData, FxRatePurpose } from "@/lib/types";
import { allFundMetrics, type FundMetrics } from "@/lib/calc/fund";
import { allCompanyRollups, allLotPositions } from "@/lib/calc/portfolio";
import { convert, latestRate } from "@/lib/calc/fx";

export interface PortfolioTotalsOptions {
  fundId?: string;
}

export interface DisplayPortfolioTotals {
  deployed: number;
  nav: number;
  unrealized: number;
  moic: number;
  companyCount: number;
  activeLotCount: number;
  displayCurrency: CurrencyCode;
}

export interface PortfolioTotals {
  /** Totals are grouped by fund currency — never summed across currencies. */
  deployedByCurrency: Record<string, number>;
  navByCurrency: Record<string, number>;
  unrealizedByCurrency: Record<string, number>;
  realizedByCurrency: Record<string, number>;
  companyCount: number;
  lotCount: number;
  activeLotCount: number;
  gainers: number;
  losers: number;
  flat: number;
}

export function portfolioTotals(
  data: FundOSData,
  options?: PortfolioTotalsOptions
): PortfolioTotals {
  const fundId = options?.fundId;
  const metrics = fundId
    ? allFundMetrics(data).filter((m) => m.fund.id === fundId)
    : allFundMetrics(data);
  const positions = fundId
    ? allLotPositions(data).filter((p) => p.fund.id === fundId)
    : allLotPositions(data);

  const deployedByCurrency: Record<string, number> = {};
  const navByCurrency: Record<string, number> = {};
  const unrealizedByCurrency: Record<string, number> = {};
  const realizedByCurrency: Record<string, number> = {};

  for (const m of metrics) {
    deployedByCurrency[m.currency] =
      (deployedByCurrency[m.currency] ?? 0) + m.deployedCost;
    navByCurrency[m.currency] = (navByCurrency[m.currency] ?? 0) + m.currentNav;
    unrealizedByCurrency[m.currency] =
      (unrealizedByCurrency[m.currency] ?? 0) + m.unrealizedGain;
    realizedByCurrency[m.currency] =
      (realizedByCurrency[m.currency] ?? 0) + m.realizedProceeds;
  }

  let gainers = 0;
  let losers = 0;
  let flat = 0;
  for (const p of positions) {
    if (p.unrealizedFund > 0.0001) gainers++;
    else if (p.unrealizedFund < -0.0001) losers++;
    else flat++;
  }

  return {
    deployedByCurrency,
    navByCurrency,
    unrealizedByCurrency,
    realizedByCurrency,
    companyCount: new Set(positions.map((p) => p.company.id)).size,
    lotCount: positions.length,
    activeLotCount: positions.filter(
      (p) => p.lot.status === "active" || p.lot.status === "partial_exit"
    ).length,
    gainers,
    losers,
    flat,
  };
}

/** Portfolio KPIs converted to a single display currency using reporting FX. */
export function displayPortfolioTotals(
  data: FundOSData,
  targetCurrency: CurrencyCode,
  asOf: string,
  options?: PortfolioTotalsOptions
): DisplayPortfolioTotals {
  const fundId = options?.fundId;
  const metrics = fundId
    ? allFundMetrics(data).filter((m) => m.fund.id === fundId)
    : allFundMetrics(data);

  // Display conversion uses today's reporting FX, not mark-date FX embedded
  // in snapshots — otherwise toggling USD/INR uses stale snapshot-era rates.
  const fxAsOf = new Date().toISOString().slice(0, 10);
  const displayFxOptions: { purposes: FxRatePurpose[] } = {
    // Prefer live reporting rates; manual overrides still apply when newer.
    purposes: ["reporting", "manual", "transaction"],
  };

  const positions = fundId
    ? allLotPositions(data).filter((p) => p.fund.id === fundId)
    : allLotPositions(data);

  const deployed = metrics.reduce((sum, m) => {
    return (
      sum +
      convert(
        data.fxRates,
        m.deployedCost,
        m.currency as CurrencyCode,
        targetCurrency,
        fxAsOf,
        displayFxOptions
      )
    );
  }, 0);
  const nav = metrics.reduce((sum, m) => {
    return (
      sum +
      convert(
        data.fxRates,
        m.currentNav,
        m.currency as CurrencyCode,
        targetCurrency,
        fxAsOf,
        displayFxOptions
      )
    );
  }, 0);
  const unrealized = metrics.reduce((sum, m) => {
    return (
      sum +
      convert(
        data.fxRates,
        m.unrealizedGain,
        m.currency as CurrencyCode,
        targetCurrency,
        fxAsOf,
        displayFxOptions
      )
    );
  }, 0);

  return {
    deployed,
    nav,
    unrealized,
    moic: deployed > 0 ? nav / deployed : 0,
    companyCount: new Set(positions.map((p) => p.company.id)).size,
    activeLotCount: positions.filter(
      (p) => p.lot.status === "active" || p.lot.status === "partial_exit"
    ).length,
    displayCurrency: targetCurrency,
  };
}

export function latestSnapshotDate(data: FundOSData): string {
  return (
    data.positionSnapshots
      .map((s) => s.snapshot_date)
      .sort()
      .reverse()[0] ?? new Date().toISOString().slice(0, 10)
  );
}

export function fundDisplayLabel(vehicleCode: string, name: string): string {
  if (vehicleCode === "F1") return "Fund 1 (USD)";
  if (vehicleCode === "F2") return "Fund 2 (INR)";
  return name;
}

export interface FxSummaryRow {
  id: string;
  pair: string;
  from: string;
  to: string;
  rate: number;
  rate_date: string;
  source: string | null;
  purpose: string;
}

export function fxSummary(data: FundOSData): FxSummaryRow[] {
  const pairs = new Set<string>();
  for (const r of data.fxRates) {
    if (r.from_currency === r.to_currency) continue;
    pairs.add(`${r.from_currency}>${r.to_currency}`);
  }
  const rows: FxSummaryRow[] = [];
  for (const pair of pairs) {
    const [from, to] = pair.split(">");
    const latest = latestRate(data.fxRates, from, to);
    if (latest) {
      rows.push({
        id: latest.id,
        pair: `${from}/${to}`,
        from,
        to,
        rate: latest.rate,
        rate_date: latest.rate_date,
        source: latest.source,
        purpose: latest.purpose ?? "reporting",
      });
    }
  }
  return rows.sort((a, b) => a.pair.localeCompare(b.pair));
}
