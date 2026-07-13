/**
 * Lot entry math — cash invested is always derived from shares × price.
 */

export function calcCashInvestedLocal(
  shares: number | null | undefined,
  pricePerShare: number | null | undefined
): number {
  const s = shares ?? 0;
  const p = pricePerShare ?? 0;
  if (!Number.isFinite(s) || !Number.isFinite(p)) return 0;
  return Math.round(s * p * 100) / 100;
}
