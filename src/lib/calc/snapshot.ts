/**
 * Position snapshot math — the single implementation of mark-to-market.
 * Mirrors the SQL function create_position_snapshot() exactly so the app
 * and database always agree.
 *
 *   fmv_local  = as_converted_shares * mark_price_local * mark_factor
 *   fmv_fund   = fmv_local * fx_rate_at_mark
 *   cost_basis = lot.cash_invested_fund
 *   unrealized = fmv_fund - cost_basis_fund
 *   moic       = fmv_fund / cost_basis_fund   (0 when cost <= 0)
 */

import type { CurrencyCode, InvestmentLot, PositionSnapshot } from "@/lib/types";

export interface SnapshotInputs {
  lot: InvestmentLot;
  snapshot_date: string;
  mark_price_per_share_local: number;
  fx_rate_at_mark: number;
  mark_factor?: number;
  as_converted_shares?: number;
  ownership_pct_at_event?: number | null;
  valuation_mark_id?: string | null;
  notes?: string | null;
  currency?: CurrencyCode;
  id?: string;
}

export interface SnapshotResult {
  fmv_local: number;
  fmv_fund: number;
  cost_basis_fund: number;
  unrealized_gain_loss_fund: number;
  moic_at_snapshot: number;
}

export function computeSnapshotValues(
  input: Omit<SnapshotInputs, "id">
): SnapshotResult {
  const { lot } = input;
  const markFactor = input.mark_factor ?? 1;
  const shares = input.as_converted_shares ?? lot.shares_acquired ?? 0;
  const cost = lot.cash_invested_fund;

  const fmvLocal = shares * input.mark_price_per_share_local * markFactor;
  const fmvFund = fmvLocal * input.fx_rate_at_mark;
  const unrealized = fmvFund - cost;
  const moic = cost > 0 ? round(fmvFund / cost, 4) : 0;

  return {
    fmv_local: round(fmvLocal, 2),
    fmv_fund: round(fmvFund, 2),
    cost_basis_fund: round(cost, 2),
    unrealized_gain_loss_fund: round(unrealized, 2),
    moic_at_snapshot: moic,
  };
}

/** Build a full PositionSnapshot row from inputs (used by seed + create flows). */
export function buildSnapshot(input: SnapshotInputs): PositionSnapshot {
  const values = computeSnapshotValues(input);
  const shares = input.as_converted_shares ?? input.lot.shares_acquired ?? 0;
  const currency = input.currency ?? input.lot.currency;
  return {
    id: input.id ?? cryptoId(),
    lot_id: input.lot.id,
    valuation_mark_id: input.valuation_mark_id ?? null,
    snapshot_code: `SNAP-${input.lot.code}-${input.snapshot_date}`,
    snapshot_date: input.snapshot_date,
    as_converted_shares: shares,
    ownership_pct_at_event: input.ownership_pct_at_event ?? null,
    mark_price_per_share_local: input.mark_price_per_share_local,
    currency,
    fx_rate_at_mark: input.fx_rate_at_mark,
    mark_factor: input.mark_factor ?? 1,
    ...values,
    notes: input.notes ?? null,
    created_at: `${input.snapshot_date}T00:00:00.000Z`,
  };
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function cryptoId(): string {
  // Deterministic-enough unique id for seed rows.
  return "ps-" + Math.random().toString(36).slice(2, 12);
}
