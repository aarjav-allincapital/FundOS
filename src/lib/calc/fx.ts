/**
 * FX engine. Resolves conversion rates from the fx_rates table using the
 * most recent rate on-or-before a given date, mirroring the SQL logic in
 * fan_out_valuation_snapshots.
 *
 * Transaction rates (lot entry FX) are excluded from reporting lookups
 * by default unless explicitly requested.
 */

import type { CurrencyCode, FxRate, FxRatePurpose } from "@/lib/types";

export interface FxLookupResult {
  rate: number;
  rate_date: string | null;
  /** true when from === to (identity) or an explicit identity row was found */
  isIdentity: boolean;
  /** true when no rate could be resolved and a fallback of 1 was used */
  missing: boolean;
}

export interface ResolveFxOptions {
  /** Which rate purposes to consider. Defaults to reporting + manual. */
  purposes?: FxRatePurpose[];
}

const REPORTING_PURPOSES: FxRatePurpose[] = ["reporting", "manual"];

function ratePurpose(rate: FxRate): FxRatePurpose {
  return rate.purpose ?? "reporting";
}

function filterByPurpose(rates: FxRate[], purposes: FxRatePurpose[]): FxRate[] {
  return rates.filter((r) => purposes.includes(ratePurpose(r)));
}

function pickBest(list: FxRate[], asOf: string): FxRate | null {
  const eligible = list
    .filter((r) => r.rate_date <= asOf)
    .sort((a, b) => {
      if (a.rate_date !== b.rate_date) {
        return a.rate_date < b.rate_date ? 1 : -1;
      }
      const aManual = ratePurpose(a) === "manual" ? 1 : 0;
      const bManual = ratePurpose(b) === "manual" ? 1 : 0;
      return bManual - aManual;
    });
  return eligible[0] ?? null;
}

/**
 * Nearest rate to `asOf` ignoring the on-or-before cutoff. Used as a fallback
 * so cross-currency conversion never silently collapses to an identity 1.0
 * (which would misstate totals by the entire FX magnitude, e.g. ~83x for
 * INR/USD). Prefers the closest date, then the more recent, then manual.
 */
function pickNearest(list: FxRate[], asOf: string): FxRate | null {
  if (list.length === 0) return null;
  const target = Date.parse(asOf);
  return [...list].sort((a, b) => {
    const da = Math.abs(Date.parse(a.rate_date) - target);
    const db = Math.abs(Date.parse(b.rate_date) - target);
    if (da !== db) return da - db;
    if (a.rate_date !== b.rate_date) return a.rate_date < b.rate_date ? 1 : -1;
    const aManual = ratePurpose(a) === "manual" ? 1 : 0;
    const bManual = ratePurpose(b) === "manual" ? 1 : 0;
    return bManual - aManual;
  })[0];
}

/**
 * Resolve the FX rate to convert `from` -> `to` as of `asOf` (YYYY-MM-DD).
 * Falls back to identity (1.0) when currencies match. When no rate exists
 * on-or-before `asOf`, uses the nearest available rate (flagged stale via
 * `missing`) rather than a meaningless 1.0.
 */
export function resolveFxRate(
  rates: FxRate[],
  from: CurrencyCode,
  to: CurrencyCode,
  asOf: string,
  options?: ResolveFxOptions
): FxLookupResult {
  if (from === to) {
    return { rate: 1, rate_date: asOf, isIdentity: true, missing: false };
  }

  const purposes = options?.purposes ?? REPORTING_PURPOSES;
  const pool = filterByPurpose(rates, purposes);

  const direct = pool.filter(
    (r) => r.from_currency === from && r.to_currency === to
  );
  const hit = pickBest(direct, asOf);
  if (hit) {
    return {
      rate: hit.rate,
      rate_date: hit.rate_date,
      isIdentity: hit.source === "identity",
      missing: false,
    };
  }

  const inverse = pool.filter(
    (r) =>
      r.from_currency === to && r.to_currency === from && r.rate !== 0
  );
  const inv = pickBest(inverse, asOf);
  if (inv) {
    return {
      rate: 1 / inv.rate,
      rate_date: inv.rate_date,
      isIdentity: false,
      missing: false,
    };
  }

  // Fallback: nearest rate regardless of date, so conversion stays meaningful.
  const nearestDirect = pickNearest(direct, asOf);
  if (nearestDirect) {
    return {
      rate: nearestDirect.rate,
      rate_date: nearestDirect.rate_date,
      isIdentity: nearestDirect.source === "identity",
      missing: true,
    };
  }

  const nearestInverse = pickNearest(inverse, asOf);
  if (nearestInverse) {
    return {
      rate: 1 / nearestInverse.rate,
      rate_date: nearestInverse.rate_date,
      isIdentity: false,
      missing: true,
    };
  }

  return { rate: 1, rate_date: null, isIdentity: false, missing: true };
}

export function convert(
  rates: FxRate[],
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  asOf: string,
  options?: ResolveFxOptions
): number {
  return amount * resolveFxRate(rates, from, to, asOf, options).rate;
}

/** Latest reporting rate for a pair, for FX summary widgets. */
export function latestRate(
  rates: FxRate[],
  from: CurrencyCode,
  to: CurrencyCode,
  options?: ResolveFxOptions
): FxRate | null {
  const purposes = options?.purposes ?? REPORTING_PURPOSES;
  const list = filterByPurpose(rates, purposes)
    .filter((r) => r.from_currency === from && r.to_currency === to)
    .sort((a, b) => (a.rate_date < b.rate_date ? 1 : -1));
  return list[0] ?? null;
}
