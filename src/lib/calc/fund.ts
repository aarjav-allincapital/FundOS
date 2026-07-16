/**
 * Fund-level metrics. Each metric is derived from base tables so figures
 * can be audited back to lots, snapshots and realizations.
 *
 * Definitions (institutional):
 *   Deployed (cost)    = sum of active lot cost basis (fund ccy)
 *   Current NAV (unreal)= sum of latest snapshot FMV for active lots
 *   Realized proceeds  = sum of realization net_amount (fund ccy)
 *   Gross MOIC         = (NAV + realized) / deployed
 *   Unrealized MOIC    = NAV / deployed
 *   DPI                = realized / deployed
 *   Unrealized gain    = NAV - deployed
 */

import type { Fund, FundOSData } from "@/lib/types";
import { allLotPositions, LotPosition } from "@/lib/calc/portfolio";
import { convert } from "@/lib/calc/fx";

export interface FundMetrics {
  fund: Fund;
  currency: string;
  lotCount: number;
  companyCount: number;
  deployedCost: number;
  currentNav: number;
  realizedProceeds: number;
  unrealizedGain: number;
  grossMoic: number;
  unrealizedMoic: number;
  dpi: number;
  activePositions: number;
  exitedPositions: number;
}

export function fundMetrics(data: FundOSData, fund: Fund): FundMetrics {
  const positions = allLotPositions(data).filter((p) => p.fund.id === fund.id);
  const active = positions.filter(
    (p) => p.lot.status === "active" || p.lot.status === "partial_exit"
  );

  // Deployed = total capital paid in (immutable), NOT remaining basis — so a
  // partial exit never shrinks the DPI/TVPI/MOIC denominator.
  const deployedCost = sum(positions.map((p) => p.paidInFund));
  const currentNav = sum(active.map((p) => p.fmvFund));

  const realizedProceeds = data.realizations
    .filter((r) => positionInFund(positions, r.lot_id))
    .reduce((s, r) => {
      const net = r.net_amount ?? 0;
      // Convert realization to fund currency as of realization date
      const inFund =
        r.currency === fund.currency
          ? net
          : convert(data.fxRates, net, r.currency, fund.currency, r.realization_date);
      return s + inFund;
    }, 0);

  const unrealizedGain = currentNav - sum(active.map((p) => p.costBasisFund));
  const grossMoic =
    deployedCost > 0 ? (currentNav + realizedProceeds) / deployedCost : 0;
  const unrealizedMoic = deployedCost > 0 ? currentNav / deployedCost : 0;
  const dpi = deployedCost > 0 ? realizedProceeds / deployedCost : 0;

  const companyCount = new Set(positions.map((p) => p.company.id)).size;

  return {
    fund,
    currency: fund.currency,
    lotCount: positions.length,
    companyCount,
    deployedCost,
    currentNav,
    realizedProceeds,
    unrealizedGain,
    grossMoic,
    unrealizedMoic,
    dpi,
    activePositions: active.length,
    exitedPositions: positions.filter((p) => p.lot.status === "full_exit").length,
  };
}

export function allFundMetrics(data: FundOSData): FundMetrics[] {
  return data.funds
    .map((f) => fundMetrics(data, f))
    .sort((a, b) => a.fund.code.localeCompare(b.fund.code));
}

function positionInFund(positions: LotPosition[], lotId: string): boolean {
  return positions.some((p) => p.lot.id === lotId);
}

function sum(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0);
}
