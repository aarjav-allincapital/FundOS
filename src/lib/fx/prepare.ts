/**
 * FX preparation — fetches live rates before mutations persist data.
 */

import type { FundOSData } from "@/lib/types";
import { fetchLiveFxRate, isLiveFxPair } from "@/lib/fx/live-fx";
import { resolveFxRate } from "@/lib/calc/fx";
import type { AddLotInput } from "@/lib/data/mutations";

export function pairKey(from: string, to: string): string {
  return `${from}>${to}`;
}

/** Transaction FX: fetched for the investment date; editable later on the lot. */
export async function resolveTransactionFx(
  data: FundOSData,
  input: AddLotInput
): Promise<number> {
  if (input.fx_rate_at_entry != null) return input.fx_rate_at_entry;

  const fund = data.funds.find((f) => f.id === input.fund_id);
  if (!fund || input.currency === fund.currency) return 1;

  if (isLiveFxPair(input.currency, fund.currency)) {
    const result = await fetchLiveFxRate(
      input.currency,
      fund.currency,
      input.investment_date
    );
    return result.rate;
  }

  return resolveFxRate(
    data.fxRates,
    input.currency,
    fund.currency,
    input.investment_date,
    { purposes: ["reporting", "manual"] }
  ).rate;
}

/** Reporting FX map for valuation fan-out (company ccy → each fund ccy). */
export async function resolveReportingFxMap(
  data: FundOSData,
  from: string,
  asOf: string,
  toCurrencies: string[]
): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  const unique = [...new Set(toCurrencies.filter((to) => to !== from))];

  await Promise.all(
    unique.map(async (to) => {
      if (isLiveFxPair(from, to)) {
        const result = await fetchLiveFxRate(from, to, asOf);
        map[pairKey(from, to)] = result.rate;
      } else {
        map[pairKey(from, to)] = resolveFxRate(
          data.fxRates,
          from,
          to,
          asOf,
          { purposes: ["reporting", "manual"] }
        ).rate;
      }
    })
  );

  return map;
}

/** Reporting FX for a single lot snapshot. */
export async function resolveReportingFx(
  data: FundOSData,
  from: string,
  to: string,
  asOf: string
): Promise<number> {
  if (from === to) return 1;
  const map = await resolveReportingFxMap(data, from, asOf, [to]);
  return map[pairKey(from, to)] ?? 1;
}
