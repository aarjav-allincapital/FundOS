import type { DealStage, FundOSData } from "@/lib/types";
import { createBootstrapData } from "@/lib/data/bootstrap";

const STORAGE_KEY = "fundos_data_v1";

const LEGACY_STAGE_MAP: Record<string, DealStage> = {  early_evaluation: "first_call",
  deep_dive: "second_call",
};

function migrateDealStages(data: FundOSData): FundOSData {
  let changed = false;

  const deals = data.deals.map((deal) => {
    const next = LEGACY_STAGE_MAP[deal.stage];
    if (!next) return deal;
    changed = true;
    return { ...deal, stage: next };
  });

  const dealStageHistory = data.dealStageHistory.map((row) => {
    const from = row.from_stage
      ? LEGACY_STAGE_MAP[row.from_stage] ?? row.from_stage
      : null;
    const to = LEGACY_STAGE_MAP[row.to_stage] ?? row.to_stage;
    if (from === row.from_stage && to === row.to_stage) return row;
    changed = true;
    return { ...row, from_stage: from, to_stage: to };
  });

  if (!changed) return data;
  return { ...data, deals, dealStageHistory };
}

/**
 * Backfill paid_in_capital_fund on lots persisted before it existed. Best-effort:
 * uses current cash_invested_fund, which for a lot already partially exited is
 * the reduced basis (the original is unrecoverable) — new lots record it correctly.
 */
function migratePaidInCapital(data: FundOSData): FundOSData {
  let changed = false;
  const investmentLots = data.investmentLots.map((lot) => {
    if (lot.paid_in_capital_fund != null) return lot;
    changed = true;
    return { ...lot, paid_in_capital_fund: lot.cash_invested_fund };
  });
  if (!changed) return data;
  return { ...data, investmentLots };
}

const BOOTSTRAP_FX_IDS = new Set(["fx-inr-usd", "fx-usd-inr"]);

function stripBootstrapFx(data: FundOSData): FundOSData {
  const fxRates = data.fxRates.filter((r) => !BOOTSTRAP_FX_IDS.has(r.id));
  if (fxRates.length === data.fxRates.length) return data;
  return { ...data, fxRates };
}

export function loadFundOSData(): FundOSData {
  if (typeof window === "undefined") return createBootstrapData();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const bootstrap = createBootstrapData();
      saveFundOSData(bootstrap);
      return bootstrap;
    }
    let data = migrateDealStages(JSON.parse(raw) as FundOSData);
    data = migratePaidInCapital(data);
    data = stripBootstrapFx(data);
    saveFundOSData(data);
    return data;
  } catch {
    const bootstrap = createBootstrapData();
    saveFundOSData(bootstrap);
    return bootstrap;
  }
}

export function saveFundOSData(data: FundOSData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function resetFundOSData(): FundOSData {
  const bootstrap = createBootstrapData();
  saveFundOSData(bootstrap);
  return bootstrap;
}

export const SIDEBAR_COLLAPSED_KEY = "fundos_sidebar_collapsed";

export function loadSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
}
