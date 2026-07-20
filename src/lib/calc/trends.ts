/**
 * Time-series derivations for NAV / value trend charts. Values are built by
 * carrying each lot's most recent snapshot forward to every observation date,
 * so the series reflects mark-to-market NAV over time.
 */

import type { Fund, FundOSData } from "@/lib/types";
import type { TrendPoint } from "@/components/charts/TrendLine";

function observationDates(data: FundOSData, lotIds: Set<string>): string[] {
  const dates = new Set<string>();
  for (const s of data.positionSnapshots) {
    if (lotIds.has(s.lot_id)) dates.add(s.snapshot_date);
  }
  return Array.from(dates).sort();
}

function navAsOf(
  data: FundOSData,
  lotIds: Set<string>,
  asOf: string
): number {
  let total = 0;
  for (const lotId of lotIds) {
    const snap = data.positionSnapshots
      .filter((s) => s.lot_id === lotId && s.snapshot_date <= asOf)
      .sort((a, b) => (a.snapshot_date < b.snapshot_date ? 1 : -1))[0];
    if (snap) total += snap.fmv_fund;
  }
  return total;
}

export function fundNavTrend(data: FundOSData, fund: Fund): TrendPoint[] {
  const lotIds = new Set(
    data.investmentLots.filter((l) => l.fund_id === fund.id).map((l) => l.id)
  );
  return observationDates(data, lotIds).map((d) => ({
    label: d,
    value: Math.round(navAsOf(data, lotIds, d)),
  }));
}

export function companyValueTrend(
  data: FundOSData,
  companyId: string
): TrendPoint[] {
  const lotIds = new Set(
    data.investmentLots.filter((l) => l.company_id === companyId).map((l) => l.id)
  );
  return observationDates(data, lotIds).map((d) => ({
    label: d,
    value: Math.round(navAsOf(data, lotIds, d)),
  }));
}

/** Event markers overlaid on the fund timeline chart. */
export type FundTimelineEventKind = "investment" | "mark" | "exit";

export interface FundTimelineEvent {
  date: string;
  kind: FundTimelineEventKind;
  label: string;
  company: string;
}

/** One row per observation date — multi-line NAV + cumulative deployed. */
export interface FundTimelinePoint {
  date: string;
  nav: number;
  deployed: number;
}

/**
 * Fund timeline for multi-line charts: NAV (mark-to-market) and cumulative
 * capital deployed, plus discrete events (investments, valuation marks, exits).
 */
export function fundEventTimeline(
  data: FundOSData,
  fund: Fund,
): { series: FundTimelinePoint[]; events: FundTimelineEvent[] } {
  const lots = data.investmentLots.filter((l) => l.fund_id === fund.id);
  const lotIds = new Set(lots.map((l) => l.id));
  const companyIds = new Set(lots.map((l) => l.company_id));

  // Cumulative deployed steps up on each investment date (paid-in).
  const investByDate = new Map<string, number>();
  for (const lot of lots) {
    const d = lot.investment_date;
    investByDate.set(
      d,
      (investByDate.get(d) ?? 0) + (lot.paid_in_capital_fund || lot.cash_invested_fund || 0),
    );
  }

  const dateSet = new Set<string>([
    ...observationDates(data, lotIds),
    ...investByDate.keys(),
  ]);

  // Include event dates so the chart spans the full life of the fund.
  const events: FundTimelineEvent[] = [];
  for (const lot of lots) {
    const company = data.companies.find((c) => c.id === lot.company_id);
    const name = company?.brand_name || company?.legal_name || "Company";
    events.push({
      date: lot.investment_date,
      kind: "investment",
      label: `Invested in ${name}`,
      company: name,
    });
    dateSet.add(lot.investment_date);
  }

  for (const m of data.valuationMarks) {
    if (!companyIds.has(m.company_id)) continue;
    if (m.approval_status !== "approved") continue;
    const company = data.companies.find((c) => c.id === m.company_id);
    const name = company?.brand_name || company?.legal_name || "Company";
    events.push({
      date: m.valuation_date,
      kind: "mark",
      label: `${name} marked`,
      company: name,
    });
    dateSet.add(m.valuation_date);
  }

  for (const r of data.realizations) {
    const lot = lots.find((l) => l.id === r.lot_id);
    if (!lot) continue;
    const company = data.companies.find((c) => c.id === r.company_id);
    const name = company?.brand_name || company?.legal_name || "Company";
    events.push({
      date: r.realization_date,
      kind: "exit",
      label: `${name} — ${r.event_type.replace(/_/g, " ")}`,
      company: name,
    });
    dateSet.add(r.realization_date);
  }

  const dates = Array.from(dateSet).sort();

  // Prefill deployed as a step function.
  let runningDeployed = 0;
  const series: FundTimelinePoint[] = dates.map((d) => {
    runningDeployed += investByDate.get(d) ?? 0;
    return {
      date: d,
      nav: Math.round(navAsOf(data, lotIds, d)),
      deployed: Math.round(runningDeployed),
    };
  });

  events.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { series, events };
}

