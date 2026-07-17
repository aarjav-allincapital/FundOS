/**
 * Simulation set 7: ingestion — spreadsheet parsing + draft commit.
 * Parsing and commit are pure/deterministic (FX is injected), so they're
 * unit-testable; the LLM route and UI are verified in the browser.
 */

import { createBootstrapData, FUND_IDS } from "@/lib/data/bootstrap";
import { fundMetrics } from "@/lib/calc/fund";
import { parseSpreadsheet } from "@/lib/ingest/parse-spreadsheet";
import { applyEntities } from "@/lib/ingest/commit";
import { emptyEntities } from "@/lib/ingest/types";
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
const f = (d: FundOSData, id: string) => d.funds.find((x) => x.id === id)!;

// Injected FX deps — deterministic, no network.
const identityFx = {
  resolveTransactionFx: async () => 1,
  resolveReportingFxMap: async () => ({}),
};

const CSV = `Company,Sector,Fund,Round,Date,Shares,Price,Currency,Amount
Rupee AI,Fintech,F2,Seed,2025-01-01,1000,100,INR,
Dollar Co,SaaS,F1,Seed,2025-02-01,500,10,USD,"5,000"`;

// [25] CSV parses into companies + lots with derived cash
function scenario25() {
  console.log("\n[25] parseSpreadsheet: CSV → companies + lots");
  const e = parseSpreadsheet("portfolio.csv", CSV);
  check("2 companies", e.companies.length === 2, `got ${e.companies.length}`);
  check("2 lots", e.lots.length === 2, `got ${e.lots.length}`);
  const rupee = e.companies.find((c) => c.legal_name === "Rupee AI");
  check("Rupee AI currency INR", rupee?.operating_currency === "INR", `got ${rupee?.operating_currency}`);
  const rupeeLot = e.lots.find((l) => l.company_name === "Rupee AI");
  check("Rupee lot shares 1000", rupeeLot?.shares_acquired === 1000, `got ${rupeeLot?.shares_acquired}`);
  check("Rupee lot cash derived 100000", approx(rupeeLot?.cash_invested_local ?? 0, 100_000), `got ${rupeeLot?.cash_invested_local}`);
  check("Rupee lot fund F2", rupeeLot?.fund_code === "F2", `got ${rupeeLot?.fund_code}`);
  const dollarLot = e.lots.find((l) => l.company_name === "Dollar Co");
  check("Dollar lot cash from Amount 5000", approx(dollarLot?.cash_invested_local ?? 0, 5_000), `got ${dollarLot?.cash_invested_local}`);
}

// [26] applyEntities commits a lot and reconciles fund deployed
async function scenario26() {
  console.log("\n[26] applyEntities: commit lot → fund deployed");
  const d0 = createBootstrapData();
  const e = {
    ...emptyEntities(),
    companies: [{ legal_name: "Rupee AI", operating_currency: "INR" }],
    lots: [{
      company_name: "Rupee AI", fund_code: "F2", round_name: "Seed",
      investment_date: "2025-01-01", shares_acquired: 1000,
      price_per_share_local: 100, currency: "INR", cash_invested_local: 100_000,
    }],
  };
  const { data, summary } = await applyEntities(d0, e, identityFx);
  check("1 company created", summary.companiesCreated === 1, `got ${summary.companiesCreated}`);
  check("1 lot committed", summary.lots === 1, `got ${summary.lots}`);
  const fm = fundMetrics(data, f(data, FUND_IDS.F2));
  check("F2 deployed = 100000", approx(fm.deployedCost, 100_000), `got ${fm.deployedCost}`);
  check("F2 lotCount = 1", fm.lotCount === 1, `got ${fm.lotCount}`);
}

// [27] dedup: re-committing the same company reuses it, adds no duplicate
async function scenario27() {
  console.log("\n[27] applyEntities: dedup company by name");
  let d = createBootstrapData();
  const e = {
    ...emptyEntities(),
    companies: [{ legal_name: "Rupee AI", operating_currency: "INR" }],
  };
  d = (await applyEntities(d, e, identityFx)).data;
  const before = d.companies.length;
  const r2 = await applyEntities(d, e, identityFx);
  check("company reused, not duplicated", r2.summary.companiesReused === 1 && r2.summary.companiesCreated === 0,
    `created ${r2.summary.companiesCreated} reused ${r2.summary.companiesReused}`);
  check("company count unchanged", r2.data.companies.length === before, `got ${r2.data.companies.length}`);
}

// [28] cross-currency lot uses the injected transaction FX
async function scenario28() {
  console.log("\n[28] applyEntities: cross-currency lot uses injected FX");
  const d0 = createBootstrapData();
  const e = {
    ...emptyEntities(),
    companies: [{ legal_name: "Cross Co", operating_currency: "INR" }],
    lots: [{
      company_name: "Cross Co", fund_code: "F1", round_name: "Seed",
      investment_date: "2025-01-01", shares_acquired: 1000,
      price_per_share_local: 100, currency: "INR", cash_invested_local: 100_000,
    }],
  };
  const { data } = await applyEntities(d0, e, {
    resolveTransactionFx: async () => 0.012,
    resolveReportingFxMap: async () => ({}),
  });
  const fm = fundMetrics(data, f(data, FUND_IDS.F1));
  check("F1 deployed = 1200 USD (100000 × 0.012)", approx(fm.deployedCost, 1_200), `got ${fm.deployedCost}`);
}

// [29] founder referencing an unknown company is skipped, not invented
async function scenario29() {
  console.log("\n[29] applyEntities: unknown-company founder is skipped");
  const d0 = createBootstrapData();
  const e = {
    ...emptyEntities(),
    founders: [{ company_name: "Ghost Co", name: "Nobody" }],
  };
  const { data, summary } = await applyEntities(d0, e, identityFx);
  check("founder skipped", summary.founders === 0 && summary.skipped === 1, `founders ${summary.founders} skipped ${summary.skipped}`);
  check("no founder written", data.founders.length === 0, `got ${data.founders.length}`);
}

async function main() {
  scenario25();
  await scenario26();
  await scenario27();
  await scenario28();
  await scenario29();
  console.log(`\n==== ${checks - failures}/${checks} checks passed, ${failures} failures ====`);
  process.exit(failures > 0 ? 1 : 0);
}
main();
