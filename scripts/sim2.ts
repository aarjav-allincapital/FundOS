/**
 * Simulation set 2: display-currency totals, editing a lot's fund,
 * and exit/realization accounting.
 */

import { createBootstrapData, FUND_IDS } from "@/lib/data/bootstrap";
import { addCompany, addInvestmentLot, addValuationMark } from "@/lib/data/mutations";
import { updateInvestmentLot } from "@/lib/data/updates";
import { storeReportingFxRate } from "@/lib/data/fx-store";
import { pairKey } from "@/lib/fx/prepare";
import { allLotPositions } from "@/lib/calc/portfolio";
import { fundMetrics } from "@/lib/calc/fund";
import { displayPortfolioTotals } from "@/lib/calc";
import type { FundOSData, Realization } from "@/lib/types";

let failures = 0;
let checks = 0;
function approx(a: number, b: number, tol = 0.02): boolean {
  if (b === 0) return Math.abs(a) < tol;
  return Math.abs(a - b) / Math.abs(b) < tol;
}
function check(name: string, cond: boolean, detail = "") {
  checks++;
  if (!cond) { failures++; console.log(`  ❌ ${name} ${detail}`); }
  else console.log(`  ✓ ${name}`);
}
const lastCompany = (d: FundOSData) => d.companies[d.companies.length - 1];
const lotFor = (d: FundOSData, cid: string) => d.investmentLots.find((l) => l.company_id === cid)!;
const posFor = (d: FundOSData, lid: string) => allLotPositions(d).find((p) => p.lot.id === lid)!;

// ------------------------------------------------------------------
// Scenario 6: display totals across two funds converted to USD
// ------------------------------------------------------------------
function scenario6() {
  console.log("\n[6] Cross-fund display totals in USD and INR");
  let d = createBootstrapData();
  // USD company in F1: cost 10000 USD, mark to 2x => NAV 20000 USD
  d = addCompany(d, { legal_name: "US Co", operating_currency: "USD" });
  const us = lastCompany(d);
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F1, company_id: us.id, round_name: "Seed",
    investment_date: "2026-01-01", vehicle: "preferred",
    shares_acquired: 1000, price_per_share_local: 10, currency: "USD",
    cash_invested_local: 10_000,
  });
  d = addValuationMark(d, {
    company_id: us.id, valuation_date: "2026-03-01",
    valuation_type: "round_pricing", price_per_share_local: 20,
  });

  // INR company in F2: cost 1,000,000 INR, mark to 1.5x => NAV 1,500,000 INR
  d = addCompany(d, { legal_name: "IN Co", operating_currency: "INR" });
  const inn = lastCompany(d);
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2, company_id: inn.id, round_name: "Seed",
    investment_date: "2026-01-01", vehicle: "ccps",
    shares_acquired: 10_000, price_per_share_local: 100, currency: "INR",
    cash_invested_local: 1_000_000,
  });
  d = addValuationMark(d, {
    company_id: inn.id, valuation_date: "2026-03-01",
    valuation_type: "internal_mark", price_per_share_local: 150,
  });

  // Seed live reporting FX for display conversion (no hardcoded bootstrap rates).
  const USD_INR = 95.7;
  const INR_USD = Math.round((1 / USD_INR) * 1e6) / 1e6;
  d = storeReportingFxRate(d, "USD", "INR", USD_INR, "2026-06-01", "live");
  d = storeReportingFxRate(d, "INR", "USD", INR_USD, "2026-06-01", "live");

  const usd = displayPortfolioTotals(d, "USD", "2026-06-01");
  check("USD deployed = 10000 + 10449 = 20449", approx(usd.deployed, 20_449), `got ${usd.deployed}`);
  check("USD NAV ≈ 35674", approx(usd.nav, 35_674), `got ${usd.nav}`);

  // INR NAV: 1,500,000 + 20000*95.7 = 1,500,000 + 1,914,000 = 3,414,000 INR
  const inr = displayPortfolioTotals(d, "INR", "2026-06-01");
  check("INR NAV ≈ 34.14 L", approx(inr.nav, 3_414_000), `got ${inr.nav}`);
}

// ------------------------------------------------------------------
// Scenario 7: edit a lot to move it from F1 (USD) to F2 (INR)
// ------------------------------------------------------------------
function scenario7() {
  console.log("\n[7] Edit lot: move F1(USD) → F2(INR), recompute cost basis");
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "Mover Co", operating_currency: "INR" });
  const co = lastCompany(d);
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F1, company_id: co.id, round_name: "Seed",
    investment_date: "2026-01-01", vehicle: "ccps",
    shares_acquired: 1000, price_per_share_local: 100, currency: "INR",
    cash_invested_local: 100_000, fx_rate_at_entry: 0.012,
  });
  let lot = lotFor(d, co.id);
  check("before: fund is F1", lot.fund_id === FUND_IDS.F1);
  check("before: cost 1200 USD", approx(lot.cash_invested_fund, 1_200), `got ${lot.cash_invested_fund}`);

  // Move to F2 (INR). Now lot currency INR == fund currency INR → fx should be 1.
  d = updateInvestmentLot(d, {
    id: lot.id,
    fund_id: FUND_IDS.F2,
    currency: "INR",
    fx_rate_at_entry: 1,
    cash_invested_local: 100_000,
    price_per_share_local: 100,
  });
  lot = lotFor(d, co.id);
  const p = posFor(d, lot.id);
  check("after: fund is F2", lot.fund_id === FUND_IDS.F2, `got ${lot.fund_id}`);
  check("after: cost 100000 INR", approx(lot.cash_invested_fund, 100_000), `got ${lot.cash_invested_fund}`);
  check("after: position MOIC 1.0", approx(p.moic, 1.0), `got ${p.moic}`);
  const fmF2 = fundMetrics(d, d.funds.find((f) => f.id === FUND_IDS.F2)!);
  const fmF1 = fundMetrics(d, d.funds.find((f) => f.id === FUND_IDS.F1)!);
  check("F2 now has the lot", fmF2.lotCount === 1, `got ${fmF2.lotCount}`);
  check("F1 now empty", fmF1.lotCount === 0, `got ${fmF1.lotCount}`);
}

// ------------------------------------------------------------------
// Scenario 8: exit / realization accounting (calc validation)
// ------------------------------------------------------------------
function scenario8() {
  console.log("\n[8] Exit: realization proceeds → DPI / gross MOIC");
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "Exit Co", operating_currency: "INR" });
  const co = lastCompany(d);
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2, company_id: co.id, round_name: "Seed",
    investment_date: "2026-01-01", vehicle: "ccps",
    shares_acquired: 1000, price_per_share_local: 100, currency: "INR",
    cash_invested_local: 100_000,
  });
  const lot = lotFor(d, co.id);

  // Simulate a full exit at 250000 INR by inserting a realization + marking lot full_exit.
  const realization: Realization = {
    id: "real-1", lot_id: lot.id, company_id: co.id,
    realization_date: "2026-06-01", event_type: "full_exit",
    shares_sold: 1000, price_per_share: 250, gross_amount: 250_000,
    net_amount: 250_000, currency: "INR", fx_rate: 1, notes: null,
    created_at: new Date().toISOString(),
  };
  d = {
    ...d,
    realizations: [...d.realizations, realization],
    investmentLots: d.investmentLots.map((l) =>
      l.id === lot.id ? { ...l, status: "full_exit" } : l
    ),
  };

  const fm = fundMetrics(d, d.funds.find((f) => f.id === FUND_IDS.F2)!);
  check("realized proceeds = 250000", approx(fm.realizedProceeds, 250_000), `got ${fm.realizedProceeds}`);
  check("DPI = 2.5x", approx(fm.dpi, 2.5), `got ${fm.dpi}`);
  check("gross MOIC = 2.5x (NAV 0 + realized)", approx(fm.grossMoic, 2.5), `got ${fm.grossMoic}`);
  check("exited positions = 1", fm.exitedPositions === 1, `got ${fm.exitedPositions}`);
  check("active positions = 0", fm.activePositions === 0, `got ${fm.activePositions}`);
}

scenario6();
scenario7();
scenario8();
console.log(`\n==== ${checks - failures}/${checks} checks passed, ${failures} failures ====`);
process.exit(failures > 0 ? 1 : 0);
