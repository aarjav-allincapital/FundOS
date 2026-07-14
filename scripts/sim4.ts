/**
 * Simulation set 4: correctness fixes for LP-facing metrics.
 * Pins the CORRECT institutional numbers for:
 *   - partial-exit DPI / TVPI (denominator = total paid-in, not remaining basis)
 *   - missing FX must surface (NaN), never a silent 1.0
 *   - company marks must reprice partially-exited lots
 *   - orphaned references must not crash portfolio derivation
 */

import { createBootstrapData, FUND_IDS } from "@/lib/data/bootstrap";
import { addCompany, addInvestmentLot, addValuationMark, exitLot } from "@/lib/data/mutations";
import { allLotPositions } from "@/lib/calc/portfolio";
import { fundMetrics } from "@/lib/calc/fund";
import { convert } from "@/lib/calc/fx";
import type { FundOSData } from "@/lib/types";

let failures = 0, checks = 0;
function approx(a: number, b: number, tol = 0.01) {
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
const f2 = (d: FundOSData) => d.funds.find((f) => f.id === FUND_IDS.F2)!;

// [14] Partial exit: DPI/TVPI denominator stays total paid-in capital
function scenario14() {
  console.log("\n[14] partial exit keeps paid-in denominator");
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "Denom Co", operating_currency: "INR" });
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2, company_id: lastCompany(d).id, round_name: "Seed",
    investment_date: "2025-01-01", vehicle: "ccps",
    shares_acquired: 1000, price_per_share_local: 100, currency: "INR",
    cash_invested_local: 100_000,
  });
  const lot = lotFor(d, lastCompany(d).id);
  // Mark to 2x, then sell 400/1000 shares at that mark (200/share => 80k proceeds)
  d = addValuationMark(d, {
    company_id: lot.company_id, valuation_date: "2025-06-01",
    valuation_type: "internal_mark", price_per_share_local: 200,
  });
  d = exitLot(d, {
    lot_id: lot.id, realization_date: "2025-09-01",
    event_type: "partial_exit", shares_sold: 400, price_per_share: 200,
  });
  const fm = fundMetrics(d, f2(d));
  check("deployed = 100000 (paid-in, not reduced)", approx(fm.deployedCost, 100_000), `got ${fm.deployedCost}`);
  check("realized = 80000", approx(fm.realizedProceeds, 80_000), `got ${fm.realizedProceeds}`);
  check("NAV = 120000 (600 sh @ 200)", approx(fm.currentNav, 120_000), `got ${fm.currentNav}`);
  check("DPI = 0.8x", approx(fm.dpi, 0.8), `got ${fm.dpi}`);
  check("gross MOIC (TVPI) = 2.0x", approx(fm.grossMoic, 2.0), `got ${fm.grossMoic}`);
}

// [15] Missing FX must surface as NaN, never a silent 1.0
function scenario15() {
  console.log("\n[15] missing cross-currency FX surfaces (NaN, not 1.0)");
  const noRates: FundOSData["fxRates"] = [];
  const out = convert(noRates, 100_000, "INR", "USD", "2025-01-01");
  check("convert with no rate is NOT a silent 1:1", !(out === 100_000), `got ${out}`);
  check("convert with no rate is non-finite (NaN)", !Number.isFinite(out), `got ${out}`);
}

// [16] Company mark must reprice a partially-exited lot
function scenario16() {
  console.log("\n[16] company mark reprices partial-exit lot");
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "Reprice Co", operating_currency: "INR" });
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2, company_id: lastCompany(d).id, round_name: "Seed",
    investment_date: "2025-01-01", vehicle: "ccps",
    shares_acquired: 1000, price_per_share_local: 100, currency: "INR",
    cash_invested_local: 100_000,
  });
  const lot = lotFor(d, lastCompany(d).id);
  d = exitLot(d, {
    lot_id: lot.id, realization_date: "2025-06-01",
    event_type: "partial_exit", shares_sold: 400, price_per_share: 150,
  });
  // Now mark whole company UP to 300 — remaining 600 shares must reflect it.
  d = addValuationMark(d, {
    company_id: lot.company_id, valuation_date: "2025-09-01",
    valuation_type: "internal_mark", price_per_share_local: 300,
  });
  const fm = fundMetrics(d, f2(d));
  check("NAV = 180000 (600 sh @ 300, repriced)", approx(fm.currentNav, 180_000), `got ${fm.currentNav}`);
}

// [17] Orphaned reference (deleted fund) must not throw
function scenario17() {
  console.log("\n[17] orphaned lot does not crash derivation");
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "Orphan Co", operating_currency: "INR" });
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2, company_id: lastCompany(d).id, round_name: "Seed",
    investment_date: "2025-01-01", vehicle: "ccps",
    shares_acquired: 100, price_per_share_local: 100, currency: "INR",
    cash_invested_local: 10_000,
  });
  // Simulate corruption: remove the fund the lot points at.
  const corrupt: FundOSData = { ...d, funds: d.funds.filter((f) => f.id !== FUND_IDS.F2) };
  let threw = false;
  let count = -1;
  try {
    count = allLotPositions(corrupt).length;
  } catch {
    threw = true;
  }
  check("allLotPositions does not throw on orphan", !threw);
  check("orphan lot is skipped (0 positions)", count === 0, `got ${count}`);
}

scenario14(); scenario15(); scenario16(); scenario17();
console.log(`\n==== ${checks - failures}/${checks} checks passed, ${failures} failures ====`);
process.exit(failures > 0 ? 1 : 0);
