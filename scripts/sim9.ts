/**
 * Simulation set 9: full VC ops lifecycle — multiple fake companies, no DB.
 * Covers: company + founder, pipeline deal, seed → Series A, valuation marks
 * (internal / round / write-down / write-off), partial + full + write-off exits,
 * cross-currency, nomenclature codes, and fund rollups.
 *
 * Runs entirely in-memory via createBootstrapData + mutations. Zero Supabase.
 */

import { createBootstrapData, FUND_BRAND_ID, FUND_IDS } from "@/lib/data/bootstrap";
import {
  addCompany,
  addDeal,
  addFounder,
  addInvestmentLot,
  addValuationMark,
  exitLot,
} from "@/lib/data/mutations";
import { allLotPositions, companyRollup } from "@/lib/calc/portfolio";
import { fundMetrics } from "@/lib/calc/fund";
import { pairKey } from "@/lib/fx/prepare";
import type { FundOSData } from "@/lib/types";

let failures = 0;
let checks = 0;

function approx(a: number | null | undefined, b: number, tol = 0.02): boolean {
  if (a == null) return b === 0;
  if (b === 0) return Math.abs(a) < tol;
  return Math.abs(a - b) / Math.abs(b) < tol;
}

function check(name: string, cond: boolean, detail = "") {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.log(`  ✓ ${name}`);
  }
}

function lastCo(d: FundOSData) {
  return d.companies[d.companies.length - 1];
}

function coByName(d: FundOSData, fragment: string) {
  return d.companies.find((c) => c.legal_name.includes(fragment))!;
}

function lots(d: FundOSData, companyId: string) {
  return d.investmentLots.filter((l) => l.company_id === companyId);
}

function inrToUsd(rate: number) {
  return { [pairKey("INR", "USD")]: rate };
}

// ------------------------------------------------------------------
// Company A — "Nimbus" — classic seed → Series A → partial exit → re-mark
// ------------------------------------------------------------------
function scenarioNimbusLifecycle() {
  console.log("\n[A] Nimbus Fintech — seed → Series A → partial exit → mark-up");
  let d = createBootstrapData();

  d = addCompany(d, {
    legal_name: "Nimbus Fintech Pvt Ltd",
    brand_name: "Nimbus",
    sector: "Fintech",
    operating_currency: "INR",
  });
  const nimbus = lastCo(d);
  check("company abbr auto-generated", Boolean(nimbus.abbr && nimbus.abbr.length >= 2), `got ${nimbus.abbr}`);
  check("company linked to fund brand", nimbus.fund_brand_id === FUND_BRAND_ID);

  d = addFounder(d, {
    company_id: nimbus.id,
    name: "Priya Sharma",
    role: "CEO",
    is_primary: true,
  });
  d = addFounder(d, {
    company_id: nimbus.id,
    name: "Rahul Mehta",
    role: "CTO",
  });
  check("two founders stored", d.founders.filter((f) => f.company_id === nimbus.id).length === 2);

  d = addDeal(d, {
    fund_id: FUND_IDS.F2,
    company_name: "Nimbus",
    stage: "investment_committee",
    source: "inbound",
    deal_owner: "Aarav Jain",
    deal_lead: "Neha Verma",
    expected_investment: 50_000_000,
    currency: "INR",
    expected_close_date: "2025-03-01",
  });
  check("pipeline deal created", d.deals.length === 1);

  // Seed lot (F2 / INR)
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2,
    company_id: nimbus.id,
    round_name: "Seed",
    investment_date: "2025-03-15",
    vehicle: "ccps",
    shares_acquired: 10_000,
    price_per_share_local: 500,
    currency: "INR",
    cash_invested_local: 5_000_000,
    our_role: "lead",
  });
  const seedLot = lots(d, nimbus.id)[0];
  check("seed lot code matches AIC-F2 pattern", /^AIC-F2-[A-Z0-9]+-0001$/.test(seedLot.code), `got ${seedLot.code}`);
  check("seed lot sequence 1", seedLot.lot_sequence === 1);
  check("seed cost 5M INR", approx(seedLot.cash_invested_fund, 5_000_000));

  d = addValuationMark(d, {
    company_id: nimbus.id,
    valuation_date: "2025-06-30",
    valuation_type: "internal_mark",
    price_per_share_local: 750,
    post_money_local: 1_500_000_000,
  });
  const mark1 = d.valuationMarks.find((m) => m.company_id === nimbus.id)!;
  check("valuation event code VE-{abbr}-date", mark1.event_code === `VE-${nimbus.abbr}-2025-06-30`, `got ${mark1.event_code}`);
  const nimbusCached = d.companies.find((c) => c.id === nimbus.id)!;
  check("company cache updated", approx(nimbusCached.latest_mark_price, 750));

  // Series A follow-on
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2,
    company_id: nimbus.id,
    round_name: "Series A",
    investment_date: "2025-09-01",
    vehicle: "ccps",
    shares_acquired: 5_000,
    price_per_share_local: 1_000,
    currency: "INR",
    cash_invested_local: 5_000_000,
    our_role: "co_invest",
  });
  const seriesLot = lots(d, nimbus.id).find((l) => l.lot_sequence === 2)!;
  check("series A lot sequence 2", seriesLot.lot_sequence === 2);
  check("series A lot code ends -0002", seriesLot.code.endsWith("-0002"), `got ${seriesLot.code}`);
  check("two lots for Nimbus", lots(d, nimbus.id).length === 2);

  // Post–Series A mark reprices all active lots (typical IC / quarter-end workflow)
  d = addValuationMark(d, {
    company_id: nimbus.id,
    valuation_date: "2025-09-30",
    valuation_type: "internal_mark",
    price_per_share_local: 750,
    post_money_local: 2_000_000_000,
  });

  const roll = companyRollup(d, nimbus);
  check("blended cost 10M INR", approx(roll.costByCurrency["INR"], 10_000_000));
  check("blended FMV 11.25M (15000 sh × 750)", approx(roll.fmvByCurrency["INR"], 11_250_000));

  // Partial exit on seed lot
  d = exitLot(d, {
    lot_id: seedLot.id,
    realization_date: "2026-01-15",
    event_type: "partial_exit",
    shares_sold: 4_000,
    price_per_share: 1_200,
  });
  const partialLot = d.investmentLots.find((l) => l.id === seedLot.id)!;
  check("seed lot partial_exit status", partialLot.status === "partial_exit");
  check("remaining shares 6000", partialLot.shares_acquired === 6_000);
  check("realization recorded", d.realizations.some((r) => r.lot_id === seedLot.id));

  const fm = fundMetrics(d, d.funds.find((f) => f.id === FUND_IDS.F2)!);
  check("F2 realized proceeds 4.8M", approx(fm.realizedProceeds, 4_800_000));
  check("F2 deployed still 10M (paid-in)", approx(fm.deployedCost, 10_000_000));
}

// ------------------------------------------------------------------
// Company B — "Vertex" — USD fund, cross-currency, full exit
// ------------------------------------------------------------------
function scenarioVertexFullExit() {
  console.log("\n[B] Vertex Mobility — INR company in USD fund (F1) → full exit");
  let d = createBootstrapData();

  d = addCompany(d, {
    legal_name: "Vertex Mobility Pvt Ltd",
    brand_name: "Vertex",
    sector: "Mobility / EV",
    operating_currency: "INR",
  });
  const vertex = lastCo(d);

  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F1,
    company_id: vertex.id,
    round_name: "Seed",
    investment_date: "2024-06-01",
    vehicle: "preferred",
    shares_acquired: 2_000,
    price_per_share_local: 250,
    currency: "INR",
    cash_invested_local: 500_000,
    fx_rate_at_entry: 0.012,
  });
  const lot = lots(d, vertex.id)[0];
  check("cross-currency cost 6000 USD", approx(lot.cash_invested_fund, 6_000));

  d = addValuationMark(d, {
    company_id: vertex.id,
    valuation_date: "2025-12-31",
    valuation_type: "round_pricing",
    price_per_share_local: 500,
    reporting_fx: inrToUsd(0.012),
  });
  const pos = allLotPositions(d).find((p) => p.lot.id === lot.id)!;
  check("mark-up FMV 12000 USD", approx(pos.fmvFund, 12_000));

  d = exitLot(d, {
    lot_id: lot.id,
    realization_date: "2026-02-01",
    event_type: "full_exit",
    shares_sold: 2_000,
    price_per_share: 600,
    fx_rate: 0.012,
  });
  const exited = d.investmentLots.find((l) => l.id === lot.id)!;
  check("full_exit status", exited.status === "full_exit");
  const fm = fundMetrics(d, d.funds.find((f) => f.id === FUND_IDS.F1)!);
  check("F1 realized 14400 USD", approx(fm.realizedProceeds, 14_400));
  check("F1 DPI 2.4x", approx(fm.dpi, 2.4));
  check("F1 NAV 0 after exit", approx(fm.currentNav, 0));
}

// ------------------------------------------------------------------
// Company C — "Helix" — write-off path
// ------------------------------------------------------------------
function scenarioHelixWriteOff() {
  console.log("\n[C] Helix Health — seed → write-down → write-off");
  let d = createBootstrapData();

  d = addCompany(d, {
    legal_name: "Helix Health Pvt Ltd",
    brand_name: "Helix",
    sector: "Healthtech",
    operating_currency: "INR",
  });
  const helix = lastCo(d);

  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2,
    company_id: helix.id,
    round_name: "Seed",
    investment_date: "2025-01-01",
    vehicle: "ccps",
    shares_acquired: 8_000,
    price_per_share_local: 125,
    currency: "INR",
    cash_invested_local: 1_000_000,
  });

  d = addValuationMark(d, {
    company_id: helix.id,
    valuation_date: "2025-06-01",
    valuation_type: "write_down",
    price_per_share_local: 50,
  });
  const lot = lots(d, helix.id)[0];
  let pos = allLotPositions(d).find((p) => p.lot.id === lot.id)!;
  check("write-down FMV 400k", approx(pos.fmvFund, 400_000));

  d = exitLot(d, {
    lot_id: lot.id,
    realization_date: "2026-03-01",
    event_type: "write_off",
  });
  const written = d.investmentLots.find((l) => l.id === lot.id)!;
  check("written_off status", written.status === "written_off");
  const fm = fundMetrics(d, d.funds.find((f) => f.id === FUND_IDS.F2)!);
  check("write-off excluded from fund NAV", approx(fm.currentNav, 0) && fm.activePositions === 0);
}

// ------------------------------------------------------------------
// Company D — "Bloom" — USD native, external mark, distribution-style exit
// ------------------------------------------------------------------
function scenarioBloomUsdNative() {
  console.log("\n[D] Bloom Commerce — USD seed in F1, external mark, markdown");
  let d = createBootstrapData();

  d = addCompany(d, {
    legal_name: "Bloom Commerce Inc",
    brand_name: "Bloom",
    sector: "E-commerce",
    operating_currency: "USD",
  });
  const bloom = lastCo(d);

  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F1,
    company_id: bloom.id,
    round_name: "Seed",
    investment_date: "2024-01-15",
    vehicle: "preferred",
    shares_acquired: 50_000,
    price_per_share_local: 2,
    currency: "USD",
    cash_invested_local: 100_000,
  });
  const lot = lots(d, bloom.id)[0];
  check("USD lot code AIC-F1 pattern", /^AIC-F1-[A-Z0-9]+-0001$/.test(lot.code), `got ${lot.code}`);
  check("fx at entry = 1", approx(lot.fx_rate_at_entry, 1));

  d = addValuationMark(d, {
    company_id: bloom.id,
    valuation_date: "2025-06-30",
    valuation_type: "external_mark",
    price_per_share_local: 5,
  });
  let pos = allLotPositions(d).find((p) => p.lot.id === lot.id)!;
  check("external mark MOIC 2.5x", approx(pos.moic, 2.5));

  d = addValuationMark(d, {
    company_id: bloom.id,
    valuation_date: "2026-01-01",
    valuation_type: "write_down",
    price_per_share_local: 3,
  });
  pos = allLotPositions(d).find((p) => p.lot.id === lot.id)!;
  check("markdown MOIC 1.5x", approx(pos.moic, 1.5));
  check("snapshot codes exist", d.positionSnapshots.some((s) => s.lot_id === lot.id && s.snapshot_code.startsWith("SNAP-")));
}

// ------------------------------------------------------------------
// Portfolio rollup — all four companies in one book
// ------------------------------------------------------------------
function scenarioPortfolioRollup() {
  console.log("\n[E] Combined portfolio — 4 companies, fund-level rollups");
  let d = createBootstrapData();

  // Nimbus (partial exit path, abbreviated)
  d = addCompany(d, { legal_name: "Nimbus Fintech Pvt Ltd", brand_name: "Nimbus", operating_currency: "INR" });
  const nimbus = coByName(d, "Nimbus");
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2, company_id: nimbus.id, round_name: "Seed",
    investment_date: "2025-03-15", vehicle: "ccps", shares_acquired: 10_000,
    price_per_share_local: 500, currency: "INR", cash_invested_local: 5_000_000,
  });
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2, company_id: nimbus.id, round_name: "Series A",
    investment_date: "2025-09-01", vehicle: "ccps", shares_acquired: 5_000,
    price_per_share_local: 1_000, currency: "INR", cash_invested_local: 5_000_000,
  });
  const nimbusSeed = lots(d, nimbus.id)[0];
  d = exitLot(d, {
    lot_id: nimbusSeed.id, realization_date: "2026-01-15",
    event_type: "partial_exit", shares_sold: 4_000, price_per_share: 1_200,
  });

  // Vertex (full exit)
  d = addCompany(d, { legal_name: "Vertex Mobility Pvt Ltd", brand_name: "Vertex", operating_currency: "INR" });
  const vertex = coByName(d, "Vertex");
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F1, company_id: vertex.id, round_name: "Seed",
    investment_date: "2024-06-01", vehicle: "preferred", shares_acquired: 2_000,
    price_per_share_local: 250, currency: "INR", cash_invested_local: 500_000, fx_rate_at_entry: 0.012,
  });
  d = exitLot(d, {
    lot_id: lots(d, vertex.id)[0].id, realization_date: "2026-02-01",
    event_type: "full_exit", shares_sold: 2_000, price_per_share: 600, fx_rate: 0.012,
  });

  // Helix (write-off)
  d = addCompany(d, { legal_name: "Helix Health Pvt Ltd", brand_name: "Helix", operating_currency: "INR" });
  const helix = coByName(d, "Helix");
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F2, company_id: helix.id, round_name: "Seed",
    investment_date: "2025-01-01", vehicle: "ccps", shares_acquired: 8_000,
    price_per_share_local: 125, currency: "INR", cash_invested_local: 1_000_000,
  });
  d = exitLot(d, { lot_id: lots(d, helix.id)[0].id, realization_date: "2026-03-01", event_type: "write_off" });

  // Bloom (active USD)
  d = addCompany(d, { legal_name: "Bloom Commerce Inc", brand_name: "Bloom", operating_currency: "USD" });
  const bloom = coByName(d, "Bloom");
  d = addInvestmentLot(d, {
    fund_id: FUND_IDS.F1, company_id: bloom.id, round_name: "Seed",
    investment_date: "2024-01-15", vehicle: "preferred", shares_acquired: 50_000,
    price_per_share_local: 2, currency: "USD", cash_invested_local: 100_000,
  });
  d = addValuationMark(d, {
    company_id: bloom.id, valuation_date: "2026-01-01",
    valuation_type: "internal_mark", price_per_share_local: 3,
  });

  check("4 companies in book", d.companies.length === 4);
  check("5 lots total", d.investmentLots.length === 5);
  check("3 realizations", d.realizations.length === 3);
  check("valuation marks exist", d.valuationMarks.length >= 1);

  const f1 = fundMetrics(d, d.funds.find((f) => f.id === FUND_IDS.F1)!);
  const f2 = fundMetrics(d, d.funds.find((f) => f.id === FUND_IDS.F2)!);

  check("F1 has 1 active + 1 full exit", f1.activePositions === 1 && f1.exitedPositions === 1);
  check("F2 has 2 active (incl. partial) + 0 full exits", f2.activePositions === 2 && f2.exitedPositions === 0);
  check("Helix written off", d.investmentLots.some((l) => l.company_id === helix.id && l.status === "written_off"));
  check("F2 realized from Nimbus partial", approx(f2.realizedProceeds, 4_800_000));
  check("F1 Bloom NAV 150k", approx(f1.currentNav, 150_000));

  // Nomenclature integrity across book
  const codes = d.investmentLots.map((l) => l.code);
  check("all lot codes unique", new Set(codes).size === codes.length);
  check("all codes match AIC pattern", codes.every((c) => /^AIC-F[12]-[A-Z0-9]+-\d{4}$/.test(c)));
}

// ------------------------------------------------------------------
// Run all
// ------------------------------------------------------------------
scenarioNimbusLifecycle();
scenarioVertexFullExit();
scenarioHelixWriteOff();
scenarioBloomUsdNative();
scenarioPortfolioRollup();

console.log(`\n==== VC OPS SIM: ${checks - failures}/${checks} checks passed, ${failures} failures ====`);
console.log("(in-memory only — no Supabase / localStorage touched)\n");
process.exit(failures > 0 ? 1 : 0);
