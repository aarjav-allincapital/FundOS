/**
 * FX rate storage helpers — transaction rates are editable with the lot;
 * reporting rates refresh on marks/snapshots; manual overrides win.
 */

import type { FundOSData, FxRate, FxRatePurpose } from "@/lib/types";

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Upsert a transaction rate for a date (used at lot entry and when editing cost/FX). */
export function storeTransactionFxRate(
  data: FundOSData,
  from: string,
  to: string,
  rate: number,
  rate_date: string,
  source = "live"
): FundOSData {
  if (from === to) return data;

  const filtered = data.fxRates.filter(
    (r) =>
      !(
        r.purpose === "transaction" &&
        r.from_currency === from &&
        r.to_currency === to &&
        r.rate_date === rate_date
      )
  );

  const row: FxRate = {
    id: id("fx-tx"),
    from_currency: from,
    to_currency: to,
    rate,
    rate_date,
    source,
    purpose: "transaction",
  };
  return { ...data, fxRates: [...filtered, row] };
}

/** Upsert a reporting rate for a date (skipped when manual exists for that date). */
export function storeReportingFxRate(
  data: FundOSData,
  from: string,
  to: string,
  rate: number,
  rate_date: string,
  source = "live"
): FundOSData {
  if (from === to) return data;

  const hasManual = data.fxRates.some(
    (r) =>
      r.purpose === "manual" &&
      r.from_currency === from &&
      r.to_currency === to &&
      r.rate_date === rate_date
  );
  if (hasManual) return data;

  const filtered = data.fxRates.filter(
    (r) =>
      !(
        r.purpose === "reporting" &&
        r.from_currency === from &&
        r.to_currency === to &&
        r.rate_date === rate_date
      )
  );

  const row: FxRate = {
    id: id("fx-rpt"),
    from_currency: from,
    to_currency: to,
    rate,
    rate_date,
    source,
    purpose: "reporting",
  };
  return { ...data, fxRates: [...filtered, row] };
}

export function storeManualFxRate(
  data: FundOSData,
  from: string,
  to: string,
  rate: number,
  rate_date: string,
  source = "manual"
): FundOSData {
  const filtered = data.fxRates.filter(
    (r) =>
      !(
        (r.purpose === "manual" || r.purpose === "reporting") &&
        r.from_currency === from &&
        r.to_currency === to &&
        r.rate_date === rate_date
      )
  );

  const row: FxRate = {
    id: id("fx"),
    from_currency: from,
    to_currency: to,
    rate,
    rate_date,
    source,
    purpose: "manual" as FxRatePurpose,
  };
  return { ...data, fxRates: [...filtered, row] };
}
