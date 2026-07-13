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
    label: d.slice(0, 7),
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
    label: d.slice(0, 7),
    value: Math.round(navAsOf(data, lotIds, d)),
  }));
}
