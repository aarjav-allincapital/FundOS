/**
 * Simulation set 8: merge lots, founder dedup on re-ingestion, and
 * waterfall-style / catch-up effects on Net IRR.
 */

import { createBootstrapData, FUND_IDS } from "@/lib/data/bootstrap";
import { addCompany, addInvestmentLot, exitLot, mergeInvestmentLots } from "@/lib/data/mutations";
import { applyEntities } from "@/lib/ingest/commit";
import { emptyEntities } from "@/lib/ingest/types";
import { fundMetrics } from "@/lib/calc/fund";
import { fundIrr } from "@/lib/calc/irr";
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
const f2 = (d: FundOSData) => d.funds.find((f) => f.id === FUND_IDS.F2)!;
const identityFx = { resolveTransactionFx: async () => 1, resolveReportingFxMap: async () => ({}) };

function seedTwoLots(): FundOSData {
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "Merge Co", operating_currency: "INR" });
  const cid = lastCompany(d).id;
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2, company_id: cid, round_name: "Seed", investment_date: "2025-01-01",
    vehicle: "ccps", shares_acquired: 1000, price_per_share_local: 100, currency: "INR", cash_invested_local: 100_000,
  });
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2, company_id: cid, round_name: "Seed", investment_date: "2025-02-01",
    vehicle: "ccps", shares_acquired: 500, price_per_share_local: 200, currency: "INR", cash_invested_local: 100_000,
  });
  return d;
}

// [30] merge two lots in the same company+fund
function scenario30() {
  console.log("\n[30] mergeInvestmentLots: combine two lots");
  let d = seedTwoLots();
  const cid = lastCompany(d).id;
  const ids = d.investmentLots.filter((l) => l.company_id === cid).map((l) => l.id);
  d = mergeInvestmentLots(d, ids);
  const lots = d.investmentLots.filter((l) => l.company_id === cid);
  check("one lot remains", lots.length === 1, `got ${lots.length}`);
  check("shares summed = 1500", lots[0]?.shares_acquired === 1500, `got ${lots[0]?.shares_acquired}`);
  check("cost summed = 200000", approx(lots[0]?.cash_invested_fund ?? 0, 200_000), `got ${lots[0]?.cash_invested_fund}`);
  check("weighted price = 133.33", approx(lots[0]?.price_per_share_local ?? 0, 200_000 / 1_500), `got ${lots[0]?.price_per_share_local}`);
  const fm = fundMetrics(d, f2(d));
  check("fund deployed unchanged = 200000", approx(fm.deployedCost, 200_000), `got ${fm.deployedCost}`);
  check("fund NAV = 200000 (at cost)", approx(fm.currentNav, 200_000), `got ${fm.currentNav}`);
}

// [31] refuse to merge lots across different funds
function scenario31() {
  console.log("\n[31] mergeInvestmentLots: refuse cross-fund");
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "Split Co", operating_currency: "INR" });
  const cid = lastCompany(d).id;
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2, company_id: cid, round_name: "Seed", investment_date: "2025-01-01",
    vehicle: "ccps", shares_acquired: 1000, price_per_share_local: 100, currency: "INR", cash_invested_local: 100_000,
  });
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F1, company_id: cid, round_name: "Seed", investment_date: "2025-01-01",
    vehicle: "ccps", shares_acquired: 1000, price_per_share_local: 100, currency: "INR", cash_invested_local: 100_000, fx_rate_at_entry: 0.012,
  });
  const ids = d.investmentLots.filter((l) => l.company_id === cid).map((l) => l.id);
  const merged = mergeInvestmentLots(d, ids);
  check("cross-fund merge is a no-op", merged.investmentLots.filter((l) => l.company_id === cid).length === 2);
}

// [32] founder dedup on re-ingestion
async function scenario32() {
  console.log("\n[32] applyEntities: founder dedup on re-ingest");
  let d = createBootstrapData();
  const e = {
    ...emptyEntities(),
    companies: [{ legal_name: "Dedup Co", operating_currency: "INR" }],
    founders: [{ company_name: "Dedup Co", name: "Asha Rao", role: "CEO" }],
  };
  d = (await applyEntities(d, e, identityFx)).data;
  check("founder added once", d.founders.length === 1, `got ${d.founders.length}`);
  const r2 = await applyEntities(d, e, identityFx);
  check("re-ingest does not duplicate founder", r2.data.founders.length === 1, `got ${r2.data.founders.length}`);
  check("re-ingest does not duplicate company", r2.data.companies.length === d.companies.length, `got ${r2.data.companies.length}`);
}

// Build a fully-exited fund for carry math (2x in one year, INR F2).
function exitedFund(): FundOSData {
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "Carry Co", operating_currency: "INR" });
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2, company_id: lastCompany(d).id, round_name: "Seed", investment_date: "2025-01-01",
    vehicle: "ccps", shares_acquired: 1000, price_per_share_local: 100, currency: "INR", cash_invested_local: 100_000,
  });
  const lot = d.investmentLots.find((l) => l.company_id === lastCompany(d).id)!;
  return exitLot(d, { lot_id: lot.id, realization_date: "2026-01-01", event_type: "full_exit", shares_sold: 1000, price_per_share: 200 });
}

// [33] catch-up: full catch-up gives more carry → lower Net IRR than no catch-up (with a hurdle)
function scenario33() {
  console.log("\n[33] catch-up lowers Net IRR (full < none) with a hurdle");
  const d = exitedFund();
  const fund = f2(d);
  const none = fundIrr(d, fund, { asOf: "2026-01-01", economics: { mgmtFeePct: 0, carryPct: 0.2, hurdlePct: 0.08, catchUp: "none" } }).netIrr;
  const full = fundIrr(d, fund, { asOf: "2026-01-01", economics: { mgmtFeePct: 0, carryPct: 0.2, hurdlePct: 0.08, catchUp: "full" } }).netIrr;
  check("full catch-up ≤ no catch-up", (full ?? 1) <= (none ?? 0) + 1e-9, `none ${none} full ${full}`);
  check("full catch-up strictly lower than none", (full ?? 1) < (none ?? 0), `none ${none} full ${full}`);
}

// [34] waterfall style changes Net IRR when there is a realization
function scenario34() {
  console.log("\n[34] American vs European waterfall changes Net IRR");
  const d = exitedFund();
  const fund = f2(d);
  const eu = fundIrr(d, fund, { asOf: "2026-06-01", economics: { mgmtFeePct: 0, carryPct: 0.2, hurdlePct: 0, waterfallStyle: "european" } }).netIrr;
  const am = fundIrr(d, fund, { asOf: "2026-06-01", economics: { mgmtFeePct: 0, carryPct: 0.2, hurdlePct: 0, waterfallStyle: "american" } }).netIrr;
  check("european and american differ", !approx(eu, am ?? 0, 0.001), `eu ${eu} am ${am}`);
}

async function main() {
  scenario30();
  scenario31();
  await scenario32();
  scenario33();
  scenario34();
  console.log(`\n==== ${checks - failures}/${checks} checks passed, ${failures} failures ====`);
  process.exit(failures > 0 ? 1 : 0);
}
main();
