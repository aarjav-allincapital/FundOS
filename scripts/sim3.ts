/**
 * Simulation set 3: the new exitLot mutation + delete cascades.
 */

import { createBootstrapData, FUND_IDS } from "@/lib/data/bootstrap";
import { addCompany, addInvestmentLot, addValuationMark, exitLot } from "@/lib/data/mutations";
import { deleteCompany, deleteInvestmentLot } from "@/lib/data/deletes";
import { allLotPositions } from "@/lib/calc/portfolio";
import { fundMetrics } from "@/lib/calc/fund";
import type { FundOSData } from "@/lib/types";

let failures = 0, checks = 0;
function approx(a: number, b: number, tol = 0.02) {
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

function seedLot(d: FundOSData, opts: { fund: string; ccy: string; shares: number; pps: number; cash: number; fx?: number }) {
  const co = lastCompany(d);
  return addInvestmentLot(d, {
    fund_id: opts.fund, company_id: co.id, round_name: "Seed",
    investment_date: "2026-01-01", vehicle: "ccps",
    shares_acquired: opts.shares, price_per_share_local: opts.pps,
    currency: opts.ccy, cash_invested_local: opts.cash, fx_rate_at_entry: opts.fx,
  });
}

// [9] Full exit in INR fund
function scenario9() {
  console.log("\n[9] exitLot: full exit (INR fund)");
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "Exit A", operating_currency: "INR" });
  d = seedLot(d, { fund: FUND_IDS.F2, ccy: "INR", shares: 1000, pps: 100, cash: 100_000 });
  const lot = lotFor(d, lastCompany(d).id);

  d = exitLot(d, {
    lot_id: lot.id, realization_date: "2026-06-01",
    event_type: "full_exit", shares_sold: 1000, price_per_share: 300,
  });
  const fm = fundMetrics(d, d.funds.find((f) => f.id === FUND_IDS.F2)!);
  check("lot marked full_exit", d.investmentLots.find((l) => l.id === lot.id)!.status === "full_exit");
  check("realization recorded", d.realizations.length === 1);
  check("realized = 300000", approx(fm.realizedProceeds, 300_000), `got ${fm.realizedProceeds}`);
  check("DPI = 3.0x", approx(fm.dpi, 3.0), `got ${fm.dpi}`);
  check("NAV = 0 (exited)", approx(fm.currentNav, 0), `got ${fm.currentNav}`);
  check("gross MOIC = 3.0x", approx(fm.grossMoic, 3.0), `got ${fm.grossMoic}`);
}

// [10] Partial exit keeps lot active-ish, NAV still counts
function scenario10() {
  console.log("\n[10] exitLot: partial exit");
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "Exit B", operating_currency: "INR" });
  d = seedLot(d, { fund: FUND_IDS.F2, ccy: "INR", shares: 1000, pps: 100, cash: 100_000 });
  const lot = lotFor(d, lastCompany(d).id);
  d = addValuationMark(d, {
    company_id: lot.company_id, valuation_date: "2026-03-01",
    valuation_type: "internal_mark", price_per_share_local: 200,
  });
  d = exitLot(d, {
    lot_id: lot.id, realization_date: "2026-06-01",
    event_type: "partial_exit", shares_sold: 400, price_per_share: 200,
  });
  const fm = fundMetrics(d, d.funds.find((f) => f.id === FUND_IDS.F2)!);
  const updated = d.investmentLots.find((l) => l.id === lot.id)!;
  check("lot marked partial_exit", updated.status === "partial_exit");
  check("remaining shares = 600", updated.shares_acquired === 600, `got ${updated.shares_acquired}`);
  check("remaining cost = 60000", approx(updated.cash_invested_fund, 60_000), `got ${updated.cash_invested_fund}`);
  check("realized = 80000", approx(fm.realizedProceeds, 80_000), `got ${fm.realizedProceeds}`);
  // NAV should reflect only remaining 600 shares @ 200 = 120000 (no double-count)
  check("NAV = 120000 (600 sh)", approx(fm.currentNav, 120_000), `got ${fm.currentNav}`);
  check("still counted active", fm.activePositions === 1, `got ${fm.activePositions}`);
}

// [11] Cross-currency full exit (INR lot in USD fund) with explicit fx
function scenario11() {
  console.log("\n[11] exitLot: cross-currency full exit (INR lot, USD fund)");
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "Exit C", operating_currency: "INR" });
  d = seedLot(d, { fund: FUND_IDS.F1, ccy: "INR", shares: 1000, pps: 100, cash: 100_000, fx: 0.012 });
  const lot = lotFor(d, lastCompany(d).id);
  d = exitLot(d, {
    lot_id: lot.id, realization_date: "2026-06-01",
    event_type: "full_exit", shares_sold: 1000, price_per_share: 300, fx_rate: 0.012,
  });
  const fm = fundMetrics(d, d.funds.find((f) => f.id === FUND_IDS.F1)!);
  // proceeds 300000 INR * 0.012 = 3600 USD ; cost 1200 USD → DPI 3.0
  check("realized = 3600 USD", approx(fm.realizedProceeds, 3_600), `got ${fm.realizedProceeds}`);
  check("DPI = 3.0x", approx(fm.dpi, 3.0), `got ${fm.dpi}`);
}

// [12] Write-off
function scenario12() {
  console.log("\n[12] exitLot: write-off");
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "Exit D", operating_currency: "INR" });
  d = seedLot(d, { fund: FUND_IDS.F2, ccy: "INR", shares: 1000, pps: 100, cash: 100_000 });
  const lot = lotFor(d, lastCompany(d).id);
  d = exitLot(d, { lot_id: lot.id, realization_date: "2026-06-01", event_type: "write_off" });
  const fm = fundMetrics(d, d.funds.find((f) => f.id === FUND_IDS.F2)!);
  check("lot written_off", d.investmentLots.find((l) => l.id === lot.id)!.status === "written_off");
  check("realized = 0", approx(fm.realizedProceeds, 0), `got ${fm.realizedProceeds}`);
  check("DPI = 0", approx(fm.dpi, 0), `got ${fm.dpi}`);
}

// [13] Delete cascades
function scenario13() {
  console.log("\n[13] delete cascades");
  let d = createBootstrapData();
  d = addCompany(d, { legal_name: "Del Co", operating_currency: "INR" });
  const co = lastCompany(d);
  d = seedLot(d, { fund: FUND_IDS.F2, ccy: "INR", shares: 1000, pps: 100, cash: 100_000 });
  const lot = lotFor(d, co.id);
  d = addValuationMark(d, {
    company_id: co.id, valuation_date: "2026-03-01",
    valuation_type: "internal_mark", price_per_share_local: 150,
  });
  check("has snapshots before", d.positionSnapshots.length > 0);

  const afterLot = deleteInvestmentLot(d, lot.id);
  check("lot removed", !afterLot.investmentLots.some((l) => l.id === lot.id));
  check("lot snapshots removed", afterLot.positionSnapshots.every((s) => s.lot_id !== lot.id));
  check("round removed (orphan)", afterLot.rounds.every((r) => r.id !== lot.round_id));

  const afterCo = deleteCompany(d, co.id);
  check("company removed", !afterCo.companies.some((c) => c.id === co.id));
  check("company lots removed", afterCo.investmentLots.every((l) => l.company_id !== co.id));
  check("company marks removed", afterCo.valuationMarks.every((m) => m.company_id !== co.id));
  check("company snapshots removed", afterCo.positionSnapshots.length === 0);
}

scenario9(); scenario10(); scenario11(); scenario12(); scenario13();
console.log(`\n==== ${checks - failures}/${checks} checks passed, ${failures} failures ====`);
process.exit(failures > 0 ? 1 : 0);
