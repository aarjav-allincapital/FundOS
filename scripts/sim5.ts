/**
 * Simulation set 5: Gross & Net IRR (XIRR over dated fund cash flows).
 *
 * Gross IRR: capital deployed (out) at investment dates, realizations (in)
 * at realization dates, plus current NAV as a residual inflow at `asOf`.
 * Net IRR: gross flows minus modeled management fees (per year) and carried
 * interest (crystallized at `asOf`) from a configurable fund-economics model.
 */

import { createBootstrapData, FUND_IDS } from "@/lib/data/bootstrap";
import { addCompany, addInvestmentLot, exitLot } from "@/lib/data/mutations";
import { xirr, fundIrr } from "@/lib/calc/irr";
import type { FundOSData } from "@/lib/types";

let failures = 0, checks = 0;
function approx(a: number | null, b: number, tol = 0.01) {
  if (a == null) return false;
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

// [18] xirr known value: -100k then +110k a year later => 10%
function scenario18() {
  console.log("\n[18] xirr solves a known 10% return");
  const r = xirr([
    { date: "2025-01-01", amount: -100_000 },
    { date: "2026-01-01", amount: 110_000 },
  ]);
  check("xirr ≈ 0.10", approx(r, 0.10), `got ${r}`);
}

// Build a fund with one INR lot fully exited at 2x after 1 year.
function doubleInOneYear(): FundOSData {
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "IRR Co", operating_currency: "INR" });
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2, company_id: lastCompany(d).id, round_name: "Seed",
    investment_date: "2025-01-01", vehicle: "ccps",
    shares_acquired: 1000, price_per_share_local: 100, currency: "INR",
    cash_invested_local: 100_000,
  });
  const lot = lotFor(d, lastCompany(d).id);
  d = exitLot(d, {
    lot_id: lot.id, realization_date: "2026-01-01",
    event_type: "full_exit", shares_sold: 1000, price_per_share: 200,
  });
  return d;
}

// [19] Gross IRR of a clean 2x-in-1-year is ~100%
function scenario19() {
  console.log("\n[19] gross IRR of 2x in one year ≈ 100%");
  const d = doubleInOneYear();
  const fund = d.funds.find((f) => f.id === FUND_IDS.F2)!;
  const { grossIrr } = fundIrr(d, fund, { asOf: "2026-01-01" });
  check("gross IRR ≈ 1.0", approx(grossIrr, 1.0), `got ${grossIrr}`);
}

// [20] Net IRR == Gross IRR when fees & carry are zero
function scenario20() {
  console.log("\n[20] net IRR == gross IRR with zero economics");
  const d = doubleInOneYear();
  const fund = d.funds.find((f) => f.id === FUND_IDS.F2)!;
  const { grossIrr, netIrr } = fundIrr(d, fund, {
    asOf: "2026-01-01",
    economics: { mgmtFeePct: 0, carryPct: 0, hurdlePct: 0 },
  });
  check("net == gross when no fees/carry", approx(netIrr, grossIrr ?? 0), `gross ${grossIrr} net ${netIrr}`);
}

// [21] Net IRR with 2% mgmt fee + 20% carry (no hurdle): pinned ≈ 78%
function scenario21() {
  console.log("\n[21] net IRR with 2/20 economics ≈ 78%");
  const d = doubleInOneYear();
  const fund = d.funds.find((f) => f.id === FUND_IDS.F2)!;
  const { grossIrr, netIrr } = fundIrr(d, fund, {
    asOf: "2026-01-01",
    economics: { mgmtFeePct: 0.02, mgmtFeeBasis: "deployed", carryPct: 0.20, hurdlePct: 0 },
  });
  // gross 200k on 100k => fee 2000 + carry 20% of 100k profit = 20000 => net 178k => 78%
  check("net IRR ≈ 0.78", approx(netIrr, 0.78), `got ${netIrr}`);
  check("net IRR < gross IRR", (netIrr ?? 1) < (grossIrr ?? 0), `gross ${grossIrr} net ${netIrr}`);
}

// [22] A preferred-return hurdle reduces carry, lifting net IRR vs no hurdle
function scenario22() {
  console.log("\n[22] hurdle reduces carry => higher net IRR");
  const d = doubleInOneYear();
  const fund = d.funds.find((f) => f.id === FUND_IDS.F2)!;
  const noHurdle = fundIrr(d, fund, {
    asOf: "2026-01-01",
    economics: { mgmtFeePct: 0.02, carryPct: 0.20, hurdlePct: 0 },
  }).netIrr;
  const withHurdle = fundIrr(d, fund, {
    asOf: "2026-01-01",
    economics: { mgmtFeePct: 0.02, carryPct: 0.20, hurdlePct: 0.08 },
  }).netIrr;
  check("hurdle lifts net IRR", (withHurdle ?? 0) > (noHurdle ?? 0), `noHurdle ${noHurdle} withHurdle ${withHurdle}`);
}

scenario18(); scenario19(); scenario20(); scenario21(); scenario22();
console.log(`\n==== ${checks - failures}/${checks} checks passed, ${failures} failures ====`);
process.exit(failures > 0 ? 1 : 0);
