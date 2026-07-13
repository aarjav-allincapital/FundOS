/**
 * Minimal structural bootstrap — only fund brand + fund vehicles.
 * All portfolio data is entered via the UI and persisted to localStorage.
 */

import type { FundOSData } from "@/lib/types";

const BRAND_ID = "aic-brand";
const F1 = "fund-aic-f1";
const F2 = "fund-aic-f2";

export function createBootstrapData(): FundOSData {
  return {
    fundBrands: [
      {
        id: BRAND_ID,
        abbr: "AIC",
        name: "All In Capital",
        created_at: new Date().toISOString(),
      },
    ],
    funds: [
      {
        id: F1,
        fund_brand_id: BRAND_ID,
        vehicle_code: "F1",
        code: "AIC-F1",
        name: "Fund I",
        currency: "USD",
        vintage_year: 2022,
        status: "active",
        created_at: new Date().toISOString(),
      },
      {
        id: F2,
        fund_brand_id: BRAND_ID,
        vehicle_code: "F2",
        code: "AIC-F2",
        name: "Fund II",
        currency: "INR",
        vintage_year: 2023,
        status: "active",
        created_at: new Date().toISOString(),
      },
    ],
    companies: [],
    founders: [],
    deals: [],
    dealStageHistory: [],
    rounds: [],
    roundInvestors: [],
    termSheets: [],
    investmentLots: [],
    valuationMarks: [],
    positionSnapshots: [],
    fxRates: [],
    realizations: [],
    documents: [],
  };
}

export const FUND_BRAND_ID = BRAND_ID;
export const FUND_IDS = { F1, F2 };
