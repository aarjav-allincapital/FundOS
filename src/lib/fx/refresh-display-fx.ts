/**
 * Refresh reporting FX for dashboard display conversion.
 * Fetches live USD/INR once per day — skips if today's rate is already stored.
 */

import type { FundOSData, FxRate } from "@/lib/types";
import { fetchLiveFxRate, isLiveFxPair } from "@/lib/fx/live-fx";
import { storeReportingFxRate } from "@/lib/data/fx-store";

const PAIRS: [string, string][] = [
  ["USD", "INR"],
  ["INR", "USD"],
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** True when we already have a live reporting rate for this pair on `date`. */
export function hasFreshReportingFx(
  data: FundOSData,
  from: string,
  to: string,
  date: string
): boolean {
  return data.fxRates.some(
    (r) =>
      r.purpose === "reporting" &&
      r.from_currency === from &&
      r.to_currency === to &&
      r.rate_date === date &&
      r.source === "live"
  );
}

function ratesEqual(a: FxRate[], b: FxRate[]): boolean {
  if (a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Fetch live reporting FX for display conversion. Returns the same `data`
 * reference when nothing changed (avoids pointless re-renders).
 */
export async function refreshDisplayFxRates(
  data: FundOSData,
  asOf = todayIso()
): Promise<FundOSData> {
  let working = data;
  let changed = false;

  for (const [from, to] of PAIRS) {
    if (!isLiveFxPair(from, to)) continue;
    if (hasFreshReportingFx(data, from, to, asOf)) continue;

    try {
      const result = await fetchLiveFxRate(from, to, asOf);
      const next = storeReportingFxRate(
        working,
        from,
        to,
        result.rate,
        result.rate_date,
        "live"
      );
      if (!ratesEqual(working.fxRates, next.fxRates)) {
        working = next;
        changed = true;
      }
    } catch {
      // Keep existing stored rates when the provider is unreachable.
    }
  }

  return changed ? working : data;
}
