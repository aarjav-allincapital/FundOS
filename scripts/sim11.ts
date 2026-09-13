/**
 * Simulation set 11: valuation-mark taxonomy + write-off recovery.
 *
 *  - An open-round term sheet (external_mark + "termsheet") is informational:
 *    it must NOT move NAV or the company's last-approved price, and the company
 *    reports an "open round" flag.
 *  - Editing that mark to "closed" reprices NAV.
 *  - A company-scoped write-off across multiple lots splits any recovery by
 *    shares and records the rest as a realized loss (MOIC reflects it).
 */

import { createBootstrapData, FUND_IDS } from "@/lib/data/bootstrap";
import {
  addCompany,
  addInvestmentLot,
  addValuationMark,
  exitLot,
} from "@/lib/data/mutations";
import { updateValuationMark } from "@/lib/data/updates";
import { companyOpenRound, markReprices } from "@/lib/data/valuation";
import { allLotPositions } from "@/lib/calc/portfolio";
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
function posFor(d: FundOSData, lotId: string) {
  return allLotPositions(d).find((p) => p.lot.id === lotId)!;
}

// ------------------------------------------------------------------
// [35] Open-round term sheet is informational; closing it reprices NAV.
// ------------------------------------------------------------------
function scenario35() {
  console.log("\n[35] term sheet (open) is informational; closing reprices");
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "Termsheet Co", operating_currency: "INR" });
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
  const lotId = d.investmentLots.find((l) => l.company_id === co.id)!.id;

  check("markReprices(termsheet) is false", !markReprices("external_mark", "termsheet"));
  check("markReprices(closed) is true", markReprices("external_mark", "closed"));

  // Term sheet at 200/share while the round is OPEN — NAV must stay at cost.
  d = addValuationMark(d, {
    company_id: co.id,
    valuation_date: "2026-03-01",
    valuation_type: "external_mark",
    mark_status: "termsheet",
    price_per_share_local: 200,
    pre_money_local: 180_000,
    post_money_local: 200_000,
  });
  let p = posFor(d, lotId);
  check("termsheet leaves FMV at cost (100k)", approx(p.fmvFund, 100_000), `got ${p.fmvFund}`);
  check("termsheet leaves MOIC 1.0x", approx(p.moic, 1.0), `got ${p.moic}`);
  check(
    "company last-approved price unchanged",
    (d.companies.find((c) => c.id === co.id)!.last_approved_price_per_share ?? null) === null,
  );
  const open = companyOpenRound(d, co.id);
  check("company flagged as open round", open != null && open.mark_status === "termsheet");
  check("mark is still recorded", d.valuationMarks.some((m) => m.company_id === co.id));

  // Round closes at 200 — now it reprices.
  const markId = d.valuationMarks.find((m) => m.company_id === co.id)!.id;
  d = updateValuationMark(d, { id: markId, mark_status: "closed" });
  p = posFor(d, lotId);
  check("closed round reprices FMV to 200k", approx(p.fmvFund, 200_000), `got ${p.fmvFund}`);
  check("closed round MOIC 2.0x", approx(p.moic, 2.0), `got ${p.moic}`);
  check("open-round flag cleared", companyOpenRound(d, co.id) == null);
}

// ------------------------------------------------------------------
// [36] Write-off with partial recovery splits proceeds by shares.
// ------------------------------------------------------------------
function scenario36() {
  console.log("\n[36] write-off with recovery = realized loss, MOIC reflects it");
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "Bust Co", operating_currency: "INR" });
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
  const lotId = d.investmentLots.find((l) => l.company_id === co.id)!.id;
  const fund = d.funds.find((f) => f.id === FUND_IDS.F2)!;

  // Total loss (0 recovery): pps = 0, NAV drops out, proceeds 0, MOIC 0.
  let total = exitLot(d, {
    lot_id: lotId,
    realization_date: "2026-09-01",
    event_type: "write_off",
    price_per_share: 0,
  });
  let fm = fundMetrics(total, fund);
  check("total loss: deployed stays 100k", approx(fm.deployedCost, 100_000), `got ${fm.deployedCost}`);
  check("total loss: NAV 0", approx(fm.currentNav, 0), `got ${fm.currentNav}`);
  check("total loss: realized 0", approx(fm.realizedProceeds, 0), `got ${fm.realizedProceeds}`);
  check("total loss: gross MOIC 0.0x", approx(fm.grossMoic, 0), `got ${fm.grossMoic}`);
  check("lot marked written_off", total.investmentLots.find((l) => l.id === lotId)!.status === "written_off");

  // Recovery of 20k on 1000 shares → derived pps = 20 → realized 20k, MOIC 0.2x.
  const pps = 20_000 / 1000;
  let rec = exitLot(d, {
    lot_id: lotId,
    realization_date: "2026-09-01",
    event_type: "write_off",
    price_per_share: pps,
  });
  fm = fundMetrics(rec, fund);
  check("recovery: realized = 20k", approx(fm.realizedProceeds, 20_000), `got ${fm.realizedProceeds}`);
  check("recovery: NAV 0", approx(fm.currentNav, 0), `got ${fm.currentNav}`);
  check("recovery: gross MOIC 0.2x", approx(fm.grossMoic, 0.2), `got ${fm.grossMoic}`);
}

scenario35();
scenario36();

console.log(`\n==== ${checks - failures}/${checks} checks passed, ${failures} failures ====`);
if (failures > 0) process.exit(1);
