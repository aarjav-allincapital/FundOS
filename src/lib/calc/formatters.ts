/**
 * Display formatters. Pure, deterministic, no side effects.
 * All financial figures render with tabular figures at the component level.
 */

import type { CurrencyCode } from "@/lib/types";

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$",
  INR: "\u20B9",
  EUR: "\u20AC",
  GBP: "\u00A3",
};

export function currencySymbol(code: CurrencyCode): string {
  return CURRENCY_SYMBOL[code] ?? `${code} `;
}

interface MoneyOptions {
  /** Abbreviate to K/M/Cr/B for compact display. */
  compact?: boolean;
  /** Force decimals (default: 0 for compact, 2 for full). */
  decimals?: number;
  /** Show +/- sign explicitly. */
  signed?: boolean;
}

/**
 * Format a monetary amount in a specific currency.
 * INR compacts to Lakh/Crore; other currencies to K/M/B.
 */
export function formatMoney(
  value: number | null | undefined,
  currency: CurrencyCode,
  opts: MoneyOptions = {}
): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sym = currencySymbol(currency);
  const sign = value < 0 ? "-" : opts.signed ? "+" : "";
  const abs = Math.abs(value);

  if (opts.compact) {
    const compact =
      currency === "INR" ? compactINR(abs) : compactWestern(abs);
    return `${sign}${sym}${compact}`;
  }

  const decimals = opts.decimals ?? 2;
  return `${sign}${sym}${abs.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function compactINR(abs: number): string {
  // Indian numbering: Lakh (1e5), Crore (1e7)
  if (abs >= 1e7) return `${trim(abs / 1e7)} Cr`;
  if (abs >= 1e5) return `${trim(abs / 1e5)} L`;
  if (abs >= 1e3) return `${trim(abs / 1e3)} K`;
  return trim(abs);
}

function compactWestern(abs: number): string {
  if (abs >= 1e9) return `${trim(abs / 1e9)}B`;
  if (abs >= 1e6) return `${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `${trim(abs / 1e3)}K`;
  return trim(abs);
}

function trim(n: number): string {
  const r = Math.round(n * 100) / 100;
  return r.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function formatNumber(
  value: number | null | undefined,
  decimals = 0
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Ratio as multiple, e.g. 2.41x */
export function formatMultiple(
  value: number | null | undefined,
  decimals = 2
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(decimals)}x`;
}

/**
 * Percentage. `value` is a raw percentage number (e.g. 8 => "8.00%"),
 * unless `fraction` is set (0.08 => "8.00%").
 */
export function formatPercent(
  value: number | null | undefined,
  { decimals = 2, fraction = false, signed = false }: { decimals?: number; fraction?: boolean; signed?: boolean } = {}
): string {
  if (value == null || Number.isNaN(value)) return "—";
  const pct = fraction ? value * 100 : value;
  const sign = signed && pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(decimals)}%`;
}

/** Share price — currency + up to 4 decimals, matching valuation marks. */
export function formatPrice(
  value: number | null | undefined,
  currency: CurrencyCode
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${currencySymbol(currency)}${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`;
}

export function formatDate(
  value: string | null | undefined,
  variant: "short" | "medium" | "iso" = "medium"
): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  if (variant === "iso") return d.toISOString().slice(0, 10);
  if (variant === "short")
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Human label from an enum-ish snake/space string. */
export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
