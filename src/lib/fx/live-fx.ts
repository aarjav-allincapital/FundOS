/**
 * Live FX rate client (v1) — proxied through /api/fx.
 */

export interface LiveFxRateResult {
  rate: number;
  rate_date: string;
  from_currency: string;
  to_currency: string;
}

const SUPPORTED = new Set(["USD", "INR", "EUR", "GBP"]);

export function isLiveFxPair(from: string, to: string): boolean {
  return from !== to && SUPPORTED.has(from) && SUPPORTED.has(to);
}

/** Fetch via our Next.js proxy (works client + server). */
export async function fetchLiveFxRate(
  from: string,
  to: string,
  date: string
): Promise<LiveFxRateResult> {
  if (from === to) {
    return { rate: 1, rate_date: date, from_currency: from, to_currency: to };
  }

  const params = new URLSearchParams({ from, to, date });
  const res = await fetch(`/api/fx?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `FX fetch failed (${res.status})`
    );
  }
  return res.json() as Promise<LiveFxRateResult>;
}
