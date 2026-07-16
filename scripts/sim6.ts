/**
 * Simulation set 6: editable fund economics feed Net IRR.
 * Fee/carry/hurdle live on the Fund and are patched via updateFund; changing
 * them must change the fund's Net IRR without touching Gross IRR.
 */

import { createBootstrapData, FUND_IDS } from "@/lib/data/bootstrap";
import { addCompany, addInvestmentLot, exitLot } from "@/lib/data/mutations";
import { updateFund } from "@/lib/data/updates";
import { fundIrr } from "@/lib/calc/irr";
import type { FundOSData } from "@/lib/types";

let failures = 0, checks = 0;
function check(name: string, cond: boolean, detail = "") {
  checks++;
  if (!cond) { failures++; console.log(`  ❌ ${name} ${detail}`); }
  else console.log(`  ✓ ${name}`);
}
const lastCompany = (d: FundOSData) => d.companies[d.companies.length - 1];
const lotFor = (d: FundOSData, cid: string) => d.investmentLots.find((l) => l.company_id === cid)!;
const f2 = (d: FundOSData) => d.funds.find((f) => f.id === FUND_IDS.F2)!;

function doubleInOneYear(d0: FundOSData): FundOSData {
  let d = addCompany(d0, { legal_name: "Econ Co", operating_currency: "INR" });
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2, company_id: lastCompany(d).id, round_name: "Seed",
    investment_date: "2025-01-01", vehicle: "ccps",
    shares_acquired: 1000, price_per_share_local: 100, currency: "INR",
    cash_invested_local: 100_000,
  });
  const lot = lotFor(d, lastCompany(d).id);
  return exitLot(d, {
    lot_id: lot.id, realization_date: "2026-01-01",
    event_type: "full_exit", shares_sold: 1000, price_per_share: 200,
  });
}

// [23] updateFund patches economics fields
function scenario23() {
  console.log("\n[23] updateFund patches fee/carry/hurdle");
  let d = createBootstrapData();
  d = updateFund(d, { id: FUND_IDS.F2, mgmt_fee_pct: 0.03, carry_pct: 0.30, hurdle_pct: 0.06 });
  const fund = f2(d);
  check("mgmt_fee_pct = 0.03", fund.mgmt_fee_pct === 0.03, `got ${fund.mgmt_fee_pct}`);
  check("carry_pct = 0.30", fund.carry_pct === 0.30, `got ${fund.carry_pct}`);
  check("hurdle_pct = 0.06", fund.hurdle_pct === 0.06, `got ${fund.hurdle_pct}`);
  check("currency untouched", fund.currency === "INR", `got ${fund.currency}`);
}

// [24] Higher carry lowers Net IRR (fund's own economics, no override)
function scenario24() {
  console.log("\n[24] raising carry lowers Net IRR, Gross unchanged");
  const base = doubleInOneYear(createBootstrapData());
  const baseline = fundIrr(base, f2(base), { asOf: "2026-01-01" });

  const raised = updateFund(base, { id: FUND_IDS.F2, carry_pct: 0.40 });
  const after = fundIrr(raised, f2(raised), { asOf: "2026-01-01" });

  check("gross IRR unchanged", after.grossIrr === baseline.grossIrr, `${baseline.grossIrr} -> ${after.grossIrr}`);
  check("net IRR drops when carry rises",
    (after.netIrr ?? 1) < (baseline.netIrr ?? 0),
    `${baseline.netIrr} -> ${after.netIrr}`);
}

scenario23(); scenario24();
console.log(`\n==== ${checks - failures}/${checks} checks passed, ${failures} failures ====`);
process.exit(failures > 0 ? 1 : 0);
