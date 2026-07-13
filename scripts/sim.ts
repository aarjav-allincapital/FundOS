/**
 * End-to-end simulation harness driving the REAL mutation + calc code.
 * Scenarios: markup, markdown, write-off, multi-fund, cross-currency,
 * follow-on lots, and exits. Asserts financial invariants and prints
 * every failure so we can fix the underlying source.
 */

import { createBootstrapData, FUND_IDS } from "@/lib/data/bootstrap";
import {
  addCompany,
  addInvestmentLot,
  addValuationMark,
} from "@/lib/data/mutations";
import { pairKey } from "@/lib/fx/prepare";
import { allLotPositions, companyRollup } from "@/lib/calc/portfolio";
import { fundMetrics } from "@/lib/calc/fund";
import type { FundOSData } from "@/lib/types";

let failures = 0;
let checks = 0;
function approx(a: number, b: number, tol = 0.02): boolean {
  if (b === 0) return Math.abs(a) < tol;
  return Math.abs(a - b) / Math.abs(b) < tol;
}
function check(name: string, cond: boolean, detail = "") {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  ❌ ${name} ${detail}`);
  } else {
    console.log(`  ✓ ${name}`);
  }
}

function lastCompany(d: FundOSData) {
  return d.companies[d.companies.length - 1];
}
function lotFor(d: FundOSData, companyId: string) {
  return d.investmentLots.find((l) => l.company_id === companyId)!;
}
function posFor(d: FundOSData, lotId: string) {
  return allLotPositions(d).find((p) => p.lot.id === lotId)!;
}

// INR->USD reporting fx map for a valuation into a USD fund
function inrToUsd(rate: number) {
  return { [pairKey("INR", "USD")]: rate };
}

// ------------------------------------------------------------------
// Scenario 1: INR company in INR fund (F2) — markup then markdown
// ------------------------------------------------------------------
function scenario1() {
  console.log("\n[1] INR company in INR fund (F2): markup → markdown");
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "Rupee AI", operating_currency: "INR" });
  const co = lastCompany(d);

  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2,
    company_id: co.id,
    round_name: "Seed",
    investment_date: "2026-01-01",
    vehicle: "ccps",
    shares_acquired: 1000,
    price_per_share_local: 100,
    currency: "INR",
    cash_invested_local: 100_000,
  });
  const lot = lotFor(d, co.id);
  check("entry cost = 100000 INR", approx(lot.cash_invested_fund, 100_000));
  check("entry MOIC = 1.0", approx(posFor(d, lot.id).moic, 1.0));

  // Markup to 150
  d = addValuationMark(d, {
    company_id: co.id,
    valuation_date: "2026-03-01",
    valuation_type: "internal_mark",
    price_per_share_local: 150,
  });
  let p = posFor(d, lot.id);
  check("markup FMV = 150000 INR", approx(p.fmvFund, 150_000), `got ${p.fmvFund}`);
  check("markup MOIC = 1.5x", approx(p.moic, 1.5), `got ${p.moic}`);

  // Markdown to 60
  d = addValuationMark(d, {
    company_id: co.id,
    valuation_date: "2026-06-01",
    valuation_type: "write_down",
    price_per_share_local: 60,
  });
  p = posFor(d, lot.id);
  check("markdown FMV = 60000 INR", approx(p.fmvFund, 60_000), `got ${p.fmvFund}`);
  check("markdown MOIC = 0.6x", approx(p.moic, 0.6), `got ${p.moic}`);
  check("markdown unrealized = -40000", approx(p.unrealizedFund, -40_000), `got ${p.unrealizedFund}`);

  const fm = fundMetrics(d, d.funds.find((f) => f.id === FUND_IDS.F2)!);
  check("fund NAV = 60000", approx(fm.currentNav, 60_000), `got ${fm.currentNav}`);
  check("fund deployed = 100000", approx(fm.deployedCost, 100_000), `got ${fm.deployedCost}`);
}

// ------------------------------------------------------------------
// Scenario 2: INR company in USD fund (F1) — cross-currency markup
// ------------------------------------------------------------------
function scenario2() {
  console.log("\n[2] INR company in USD fund (F1): cross-currency markup");
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "Cross Co", operating_currency: "INR" });
  const co = lastCompany(d);

  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F1,
    company_id: co.id,
    round_name: "Seed",
    investment_date: "2026-01-01",
    vehicle: "ccps",
    shares_acquired: 1000,
    price_per_share_local: 100,
    currency: "INR",
    cash_invested_local: 100_000,
    fx_rate_at_entry: 0.012, // locked transaction FX
  });
  const lot = lotFor(d, co.id);
  check("entry cost = 1200 USD", approx(lot.cash_invested_fund, 1_200), `got ${lot.cash_invested_fund}`);
  check("entry MOIC = 1.0", approx(posFor(d, lot.id).moic, 1.0));

  // Markup to 150 with reporting fx same as entry
  d = addValuationMark(d, {
    company_id: co.id,
    valuation_date: "2026-03-01",
    valuation_type: "internal_mark",
    price_per_share_local: 150,
    reporting_fx: inrToUsd(0.012),
  });
  let p = posFor(d, lot.id);
  check("markup FMV = 1800 USD", approx(p.fmvFund, 1_800), `got ${p.fmvFund}`);
  check("markup MOIC = 1.5x", approx(p.moic, 1.5), `got ${p.moic}`);

  // Same price but FX depreciates (INR weakens): 0.010 → FMV should drop
  d = addValuationMark(d, {
    company_id: co.id,
    valuation_date: "2026-06-01",
    valuation_type: "internal_mark",
    price_per_share_local: 150,
    reporting_fx: inrToUsd(0.010),
  });
  p = posFor(d, lot.id);
  check("fx-depreciated FMV = 1500 USD", approx(p.fmvFund, 1_500), `got ${p.fmvFund}`);
  check("fx-depreciated MOIC = 1.25x", approx(p.moic, 1.25), `got ${p.moic}`);
}

// ------------------------------------------------------------------
// Scenario 3: write-off to zero
// ------------------------------------------------------------------
function scenario3() {
  console.log("\n[3] Write-off to zero (INR fund)");
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "Zero Co", operating_currency: "INR" });
  const co = lastCompany(d);
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2,
    company_id: co.id,
    round_name: "Seed",
    investment_date: "2026-01-01",
    vehicle: "ccps",
    shares_acquired: 500,
    price_per_share_local: 200,
    currency: "INR",
    cash_invested_local: 100_000,
  });
  const lot = lotFor(d, co.id);
  d = addValuationMark(d, {
    company_id: co.id,
    valuation_date: "2026-06-01",
    valuation_type: "write_off",
    price_per_share_local: 0,
  });
  const p = posFor(d, lot.id);
  check("write-off FMV = 0", approx(p.fmvFund, 0), `got ${p.fmvFund}`);
  check("write-off MOIC = 0", approx(p.moic, 0), `got ${p.moic}`);
  check("write-off unrealized = -100000", approx(p.unrealizedFund, -100_000), `got ${p.unrealizedFund}`);
}

// ------------------------------------------------------------------
// Scenario 4: follow-on lot (two lots, blended MOIC)
// ------------------------------------------------------------------
function scenario4() {
  console.log("\n[4] Follow-on lot: blended company MOIC");
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "Follow Co", operating_currency: "INR" });
  const co = lastCompany(d);
  // Lot 1: 1000 @ 100 = 100k
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2, company_id: co.id, round_name: "Seed",
    investment_date: "2026-01-01", vehicle: "ccps",
    shares_acquired: 1000, price_per_share_local: 100, currency: "INR",
    cash_invested_local: 100_000,
  });
  // Lot 2: 500 @ 200 = 100k
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2, company_id: co.id, round_name: "Series A",
    investment_date: "2026-02-01", vehicle: "ccps",
    shares_acquired: 500, price_per_share_local: 200, currency: "INR",
    cash_invested_local: 100_000,
  });
  // Mark whole company at 300/share
  d = addValuationMark(d, {
    company_id: co.id, valuation_date: "2026-03-01",
    valuation_type: "internal_mark", price_per_share_local: 300,
  });
  const roll = companyRollup(d, co);
  // FMV: (1000+500)*300 = 450000 ; cost 200000 → 2.25x
  check("company FMV = 450000", approx(roll.fmvByCurrency["INR"], 450_000), `got ${roll.fmvByCurrency["INR"]}`);
  check("company cost = 200000", approx(roll.costByCurrency["INR"], 200_000), `got ${roll.costByCurrency["INR"]}`);
  check("blended MOIC = 2.25x", approx(roll.blendedMoic, 2.25), `got ${roll.blendedMoic}`);
}

// ------------------------------------------------------------------
// Scenario 5: USD company in USD fund (no FX)
// ------------------------------------------------------------------
function scenario5() {
  console.log("\n[5] USD company in USD fund (identity FX)");
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "Dollar Co", operating_currency: "USD" });
  const co = lastCompany(d);
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F1, company_id: co.id, round_name: "Seed",
    investment_date: "2026-01-01", vehicle: "preferred",
    shares_acquired: 1000, price_per_share_local: 10, currency: "USD",
    cash_invested_local: 10_000,
  });
  const lot = lotFor(d, co.id);
  check("entry cost = 10000 USD", approx(lot.cash_invested_fund, 10_000));
  check("entry fx = 1", approx(lot.fx_rate_at_entry, 1));
  d = addValuationMark(d, {
    company_id: co.id, valuation_date: "2026-03-01",
    valuation_type: "round_pricing", price_per_share_local: 25,
  });
  const p = posFor(d, lot.id);
  check("markup FMV = 25000 USD", approx(p.fmvFund, 25_000), `got ${p.fmvFund}`);
  check("markup MOIC = 2.5x", approx(p.moic, 2.5), `got ${p.moic}`);
}

scenario1();
scenario2();
scenario3();
scenario4();
scenario5();

console.log(`\n==== ${checks - failures}/${checks} checks passed, ${failures} failures ====`);
process.exit(failures > 0 ? 1 : 0);
