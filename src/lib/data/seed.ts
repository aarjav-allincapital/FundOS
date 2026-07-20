/**
 * Seed dataset for FundOS.
 *
 * Grounded in the real operational data observed in All In Capital's Airtable
 * "Position Snapshot" tables (actual mark prices, as-converted shares and FMV)
 * and the Super Living records defined in supabase/migrations/001+002.
 *
 * This module produces a fully-relational FundOSData object. All money figures
 * for snapshots are computed through the shared snapshot math (buildSnapshot),
 * so the seed and the calculation engine can never diverge.
 */

import type {
  Company,
  Deal,
  DealStageHistory,
  Founder,
  Fund,
  FundBrand,
  FundOSData,
  FxRate,
  InvestmentLot,
  PositionSnapshot,
  Realization,
  Round,
  RoundInvestor,
  TermSheet,
  ValuationMark,
  InstrumentType,
  DealStage,
  DealSource,
} from "@/lib/types";
import { buildSnapshot } from "@/lib/calc/snapshot";

const BRAND_ID = "aic-brand";
const F1 = "fund-aic-f1";
const F2 = "fund-aic-f2";

const fundBrands: FundBrand[] = [
  { id: BRAND_ID, abbr: "AIC", name: "All In Capital", created_at: "2022-01-01T00:00:00Z" },
];

const funds: Fund[] = [
  {
    id: F1,
    fund_brand_id: BRAND_ID,
    vehicle_code: "F1",
    code: "AIC-F1",
    name: "Fund I",
    currency: "USD",
    vintage_year: 2022,
    status: "active",
    created_at: "2022-01-01T00:00:00Z",
  },
  {
    id: F2,
    fund_brand_id: BRAND_ID,
    vehicle_code: "F2",
    code: "AIC-F2",
    name: "Fund II",
    currency: "INR",
    vintage_year: 2023,
    status: "active",
    created_at: "2023-01-01T00:00:00Z",
  },
];

const fxRates: FxRate[] = [
  { id: "fx1", from_currency: "INR", to_currency: "USD", rate: 0.012, rate_date: "2024-08-29", source: "manual", purpose: "manual" },
  { id: "fx2", from_currency: "INR", to_currency: "USD", rate: 0.0121, rate_date: "2025-10-10", source: "manual", purpose: "manual" },
  { id: "fx3", from_currency: "INR", to_currency: "USD", rate: 0.01165, rate_date: "2026-01-19", source: "manual", purpose: "manual" },
  { id: "fx4", from_currency: "USD", to_currency: "INR", rate: 83.33, rate_date: "2024-08-29", source: "manual", purpose: "manual" },
  { id: "fx5", from_currency: "USD", to_currency: "INR", rate: 85.8, rate_date: "2026-01-19", source: "manual", purpose: "manual" },
  { id: "fx6", from_currency: "INR", to_currency: "INR", rate: 1, rate_date: "2023-01-01", source: "identity", purpose: "reporting" },
  { id: "fx7", from_currency: "USD", to_currency: "USD", rate: 1, rate_date: "2022-01-01", source: "identity", purpose: "reporting" },
];

/**
 * Company spec — compact, grounded in observed Airtable marks.
 * `markSeries` prices are the real "Mark Price Per Share" values; `shares`
 * are the real "As Converted Shares"; entryPps sets the cost basis so MOIC
 * and unrealized gain/loss form a realistic spread.
 */
interface CompanySpec {
  abbr: string;
  legal: string;
  brand: string;
  sector: string;
  city: string;
  country: string;
  status: string;
  seq: number; // Airtable numeric code, retained for traceability
  vehicle: InstrumentType;
  shares: number;
  entryPps: number;
  entryDate: string;
  roundName: string;
  ourRole: string;
  ownershipPct: number;
  postMoney: number;
  markSeries: Array<{ date: string; pps: number; approval?: "approved" | "pending" }>;
  founders?: Array<{ name: string; role: string; email?: string; linkedin?: string; primary?: boolean }>;
}

const SPECS: CompanySpec[] = [
  {
    abbr: "SL", legal: "Super Living Pvt Ltd", brand: "Super Living", sector: "Consumer / D2C",
    city: "Mumbai", country: "IN", status: "active", seq: 16, vehicle: "ccps",
    shares: 1225, entryPps: 24500, entryDate: "2023-06-15", roundName: "Seed", ourRole: "lead",
    ownershipPct: 8.0, postMoney: 450_000_000,
    markSeries: [
      { date: "2023-06-15", pps: 24500 },
      { date: "2024-08-29", pps: 36742.19, approval: "approved" },
      { date: "2025-10-10", pps: 73127.74, approval: "approved" },
    ],
    founders: [
      { name: "Ananya Rao", role: "Co-founder & CEO", email: "ananya@superliving.in", linkedin: "https://linkedin.com/in/ananyarao", primary: true },
      { name: "Karthik Menon", role: "Co-founder & CTO", email: "karthik@superliving.in" },
    ],
  },
  {
    abbr: "NF", legal: "Nimbus Fintech Pvt Ltd", brand: "Nimbus", sector: "Fintech",
    city: "Bengaluru", country: "IN", status: "active", seq: 1, vehicle: "preferred",
    shares: 1387, entryPps: 28000, entryDate: "2023-11-02", roundName: "Series A", ourRole: "co_invest",
    ownershipPct: 6.4, postMoney: 550_000_000,
    markSeries: [
      { date: "2023-11-02", pps: 28000 },
      { date: "2024-11-15", pps: 33500, approval: "approved" },
      { date: "2025-09-12", pps: 39669.09, approval: "approved" },
    ],
    founders: [{ name: "Rohan Shah", role: "Founder & CEO", primary: true, email: "rohan@nimbus.money" }],
  },
  {
    abbr: "AG", legal: "Aster Agritech Pvt Ltd", brand: "Aster", sector: "Agritech",
    city: "Pune", country: "IN", status: "active", seq: 3, vehicle: "ccps",
    shares: 1364, entryPps: 12000, entryDate: "2024-01-20", roundName: "Seed", ourRole: "lead",
    ownershipPct: 9.2, postMoney: 219_600_000,
    markSeries: [
      { date: "2024-01-20", pps: 12000 },
      { date: "2025-06-18", pps: 16132.0, approval: "approved" },
    ],
    founders: [{ name: "Meera Iyer", role: "Founder & CEO", primary: true }],
  },
  {
    abbr: "VX", legal: "Vertex Mobility Pvt Ltd", brand: "Vertex", sector: "Mobility / EV",
    city: "Chennai", country: "IN", status: "active", seq: 4, vehicle: "preferred",
    shares: 1389, entryPps: 15200, entryDate: "2024-04-10", roundName: "Series A", ourRole: "co_invest",
    ownershipPct: 5.1, postMoney: 210_000_000,
    markSeries: [
      { date: "2024-04-10", pps: 15200 },
      { date: "2026-01-19", pps: 15119.88, approval: "approved" },
    ],
  },
  {
    abbr: "HL", legal: "Helix Health Pvt Ltd", brand: "Helix", sector: "Healthtech",
    city: "Hyderabad", country: "IN", status: "active", seq: 5, vehicle: "ccps",
    shares: 17282, entryPps: 1450, entryDate: "2024-02-28", roundName: "Seed", ourRole: "lead",
    ownershipPct: 11.5, postMoney: 210_200_000,
    markSeries: [
      { date: "2024-02-28", pps: 1450 },
      { date: "2025-09-10", pps: 1736.0, approval: "approved" },
    ],
    founders: [
      { name: "Dr. Sanjay Gupta", role: "Founder & CEO", primary: true },
      { name: "Priya Nair", role: "Co-founder & COO" },
    ],
  },
  {
    abbr: "QC", legal: "Quantum Cloud Pvt Ltd", brand: "QCloud", sector: "SaaS / Infra",
    city: "Bengaluru", country: "IN", status: "active", seq: 6, vehicle: "preferred",
    shares: 351, entryPps: 61000, entryDate: "2023-08-14", roundName: "Series A", ourRole: "co_invest",
    ownershipPct: 4.2, postMoney: 1_250_000_000,
    markSeries: [
      { date: "2023-08-14", pps: 61000 },
      { date: "2024-12-19", pps: 68000, approval: "approved" },
      { date: "2025-12-19", pps: 72950.0, approval: "approved" },
    ],
    founders: [{ name: "Vikram Desai", role: "Founder & CEO", primary: true }],
  },
  {
    abbr: "OR", legal: "Orbit Robotics Pvt Ltd", brand: "Orbit", sector: "Deeptech / Robotics",
    city: "Bengaluru", country: "IN", status: "active", seq: 9, vehicle: "note",
    shares: 150, entryPps: 100000, entryDate: "2024-03-01", roundName: "Bridge", ourRole: "participant",
    ownershipPct: 2.1, postMoney: 160_000_000,
    markSeries: [
      { date: "2024-03-01", pps: 100000 },
      { date: "2026-01-06", pps: 23696.0, approval: "approved" },
    ],
  },
  {
    abbr: "TS", legal: "Terra Solar Pvt Ltd", brand: "Terra", sector: "Climate / Energy",
    city: "Ahmedabad", country: "IN", status: "active", seq: 14, vehicle: "ccps",
    shares: 4442, entryPps: 5000, entryDate: "2023-12-31", roundName: "Seed", ourRole: "lead",
    ownershipPct: 10.0, postMoney: 210_000_000,
    markSeries: [
      { date: "2023-12-31", pps: 5000 },
      { date: "2024-12-31", pps: 4953.38, approval: "approved" },
    ],
  },
  {
    abbr: "BM", legal: "Bloom Commerce Pvt Ltd", brand: "Bloom", sector: "E-commerce",
    city: "Delhi", country: "IN", status: "active", seq: 13, vehicle: "preferred",
    shares: 3022, entryPps: 5800, entryDate: "2024-05-06", roundName: "Series A", ourRole: "co_invest",
    ownershipPct: 7.3, postMoney: 100_000_000,
    markSeries: [
      { date: "2024-05-06", pps: 5800 },
      { date: "2025-05-06", pps: 6950.0, approval: "approved" },
    ],
    founders: [{ name: "Aisha Khan", role: "Founder & CEO", primary: true }],
  },
  {
    abbr: "LP", legal: "Lumen Prop Pvt Ltd", brand: "Lumen", sector: "Proptech",
    city: "Gurugram", country: "IN", status: "active", seq: 11, vehicle: "ccps",
    shares: 358, entryPps: 70000, entryDate: "2023-10-10", roundName: "Series A", ourRole: "co_invest",
    ownershipPct: 3.8, postMoney: 200_000_000,
    markSeries: [
      { date: "2023-10-10", pps: 70000 },
      { date: "2025-10-10", pps: 73127.74, approval: "approved" },
    ],
  },
  {
    abbr: "SG", legal: "Sable Gaming Pvt Ltd", brand: "Sable", sector: "Gaming / Media",
    city: "Mumbai", country: "IN", status: "active", seq: 19, vehicle: "preferred",
    shares: 174, entryPps: 98000, entryDate: "2024-06-01", roundName: "Series B", ourRole: "participant",
    ownershipPct: 1.9, postMoney: 1_150_000_000,
    markSeries: [
      { date: "2024-06-01", pps: 98000 },
      { date: "2025-08-06", pps: 115044.0, approval: "pending" },
    ],
  },
  {
    abbr: "MW", legal: "Meridian Works Pvt Ltd", brand: "Meridian", sector: "Future of Work",
    city: "Bengaluru", country: "IN", status: "written_off", seq: 20, vehicle: "safe",
    shares: 900, entryPps: 20000, entryDate: "2022-09-15", roundName: "Seed", ourRole: "lead",
    ownershipPct: 6.0, postMoney: 60_000_000,
    markSeries: [
      { date: "2022-09-15", pps: 20000 },
      { date: "2024-03-31", pps: 8000, approval: "approved" },
      { date: "2025-03-31", pps: 0, approval: "approved" },
    ],
  },
];

// -----------------------------------------------------------------
// Build relational rows from specs
// -----------------------------------------------------------------

const companies: Company[] = [];
const founders: Founder[] = [];
const deals: Deal[] = [];
const rounds: Round[] = [];
const roundInvestors: RoundInvestor[] = [];
const termSheets: TermSheet[] = [];
const investmentLots: InvestmentLot[] = [];
const valuationMarks: ValuationMark[] = [];
const positionSnapshots: PositionSnapshot[] = [];
const realizations: Realization[] = [];
const dealStageHistory: DealStageHistory[] = [];

for (const s of SPECS) {
  const companyId = `co-${s.abbr.toLowerCase()}`;
  const dealId = `deal-${s.abbr.toLowerCase()}`;
  const roundId = `round-${s.abbr.toLowerCase()}`;
  const tsId = `ts-${s.abbr.toLowerCase()}`;
  const lotId = `lot-${s.abbr.toLowerCase()}-f2`;
  const lotCode = `AIC-F2-${s.abbr}-0001`;
  const latestMark = s.markSeries[s.markSeries.length - 1];
  const approvedMarks = s.markSeries.filter((m) => m.approval === "approved");
  const latestApproved = approvedMarks[approvedMarks.length - 1];

  companies.push({
    id: companyId,
    fund_brand_id: BRAND_ID,
    abbr: s.abbr,
    legal_name: s.legal,
    brand_name: s.brand,
    sector: s.sector,
    hq_country: s.country,
    hq_city: s.city,
    website: `https://${s.brand.toLowerCase().replace(/\s+/g, "")}.com`,
    operating_currency: "INR",
    status: s.status,
    latest_mark_price: latestApproved?.pps ?? null,
    latest_mark_price_date: latestApproved?.date ?? null,
    last_priced_round_date: latestApproved?.date ?? null,
    last_approved_post_money_local: latestApproved ? s.postMoney : null,
    last_approved_price_per_share: latestApproved?.pps ?? null,
    created_at: `${s.entryDate}T00:00:00Z`,
    updated_at: `${latestMark.date}T00:00:00Z`,
  });

  for (const f of s.founders ?? []) {
    founders.push({
      id: `founder-${companyId}-${f.name.split(" ")[0].toLowerCase()}`,
      company_id: companyId,
      name: f.name,
      role: f.role,
      background: null,
      email: f.email ?? null,
      phone: null,
      linkedin_url: f.linkedin ?? null,
      is_primary: !!f.primary,
      created_at: `${s.entryDate}T00:00:00Z`,
    });
  }

  const stage: DealStage = s.status === "written_off" ? "monitoring" : "post_investment";
  deals.push({
    id: dealId,
    fund_id: F2,
    company_id: companyId,
    stage,
    source: "internal_lead",
    deal_owner_id: null,
    deal_owner: "Investment Team",
    deal_lead: s.ourRole === "lead" ? "Internal Sourcing" : "Partner Network",
    deal_lead_id: null,
    expected_investment: s.shares * s.entryPps,
    committed_amount: s.shares * s.entryPps,
    wired_amount: s.shares * s.entryPps,
    currency: "INR",
    expected_close_date: s.entryDate,
    actual_close_date: s.entryDate,
    is_first_investment: true,
    notes: null,
    created_at: `${s.entryDate}T00:00:00Z`,
    updated_at: `${s.entryDate}T00:00:00Z`,
  });

  rounds.push({
    id: roundId,
    company_id: companyId,
    deal_id: dealId,
    round_name: s.roundName,
    round_date: s.entryDate,
    our_role: s.ourRole,
    status: "active",
    price_per_share: s.entryPps,
    currency: "INR",
    pre_money_local: s.postMoney - s.shares * s.entryPps,
    post_money_local: s.postMoney,
    pre_money_fund: null,
    post_money_fund: null,
    fx_rate: 1,
    old_total_shares: Math.round(s.postMoney / s.entryPps) - s.shares,
    new_shares_issued: s.shares,
    new_total_shares: Math.round(s.postMoney / s.entryPps),
    thesis_summary: `${s.roundName} into ${s.brand} — ${s.sector}.`,
    created_at: `${s.entryDate}T00:00:00Z`,
  });

  roundInvestors.push({
    id: `ri-${roundId}`,
    round_id: roundId,
    name: "All In Capital (Fund II)",
    is_lead: s.ourRole === "lead",
    amount_local: s.shares * s.entryPps,
    currency: "INR",
  });

  const cost = s.shares * s.entryPps;
  termSheets.push({
    id: tsId,
    deal_id: dealId,
    round_id: roundId,
    side: "ours",
    status: "signed",
    vehicle: s.vehicle,
    proposed_investment_local: cost,
    currency: "INR",
    tentative_fx_rate: 1,
    proposed_investment_fund: cost,
    indicated_valuation_local: s.postMoney,
    is_post_money: true,
    implied_price_per_share: s.entryPps,
    rights_and_terms: null,
    round_name: s.roundName,
    moic_at_entry: 1,
    signed_at: `${s.entryDate}T00:00:00Z`,
    investment_lot_id: lotId,
    created_at: `${s.entryDate}T00:00:00Z`,
  });

  const lotStatus = s.status === "written_off" ? "written_off" : "active";
  const lot: InvestmentLot = {
    id: lotId,
    fund_id: F2,
    company_id: companyId,
    round_id: roundId,
    deal_id: dealId,
    term_sheet_id: tsId,
    lot_sequence: 1,
    code: lotCode,
    investment_date: s.entryDate,
    transaction_type: "primary",
    vehicle: s.vehicle,
    shares_acquired: s.shares,
    price_per_share_local: s.entryPps,
    currency: "INR",
    cash_invested_local: cost,
    cash_invested_fund: cost,
    fx_rate_at_entry: 1,
    ownership_at_entry_pct: s.ownershipPct,
    rights_and_terms: null,
    moic_on_prior_lot: null,
    overwrote_term_sheet: false,
    status: lotStatus,
    created_at: `${s.entryDate}T00:00:00Z`,
    updated_at: `${latestMark.date}T00:00:00Z`,
  };
  investmentLots.push(lot);

  // Valuation marks + snapshots (skip the entry-date "mark" as a formal mark,
  // but still snapshot entry so trend charts have a starting point).
  s.markSeries.forEach((m, idx) => {
    const isEntry = idx === 0;
    let markId: string | null = null;
    if (!isEntry) {
      markId = `mark-${companyId}-${m.date}`;
      valuationMarks.push({
        id: markId,
        company_id: companyId,
        valuation_date: m.date,
        valuation_type: m.pps === 0 ? "write_off" : "internal_mark",
        price_per_share_local: m.pps,
        currency: "INR",
        pre_money_local: null,
        post_money_local: m.pps === 0 ? 0 : Math.round(m.pps * (s.postMoney / s.entryPps)),
        source: "internal",
        approval_status: m.approval ?? "approved",
        approved_by: m.approval === "approved" ? "IC" : null,
        notes: `${s.brand} mark @ ${m.date}`,
        event_code: `VE-${s.abbr}-${m.date}`,
        created_at: `${m.date}T00:00:00Z`,
      });
    }
    positionSnapshots.push(
      buildSnapshot({
        id: `snap-${lotId}-${m.date}`,
        lot,
        snapshot_date: m.date,
        mark_price_per_share_local: m.pps,
        fx_rate_at_mark: 1,
        mark_factor: 1,
        as_converted_shares: s.shares,
        ownership_pct_at_event: s.ownershipPct,
        valuation_mark_id: markId,
        notes: isEntry ? "Entry basis" : `${s.brand} mark`,
      })
    );
  });
}

// -----------------------------------------------------------------
// Super Living second lot in Fund I (USD) — multi-fund + FX exercise
// -----------------------------------------------------------------

const slF1Lot: InvestmentLot = {
  id: "lot-sl-f1",
  fund_id: F1,
  company_id: "co-sl",
  round_id: "round-sl",
  deal_id: "deal-sl-f1",
  term_sheet_id: "ts-sl-f1",
  lot_sequence: 1,
  code: "AIC-F1-SL-0001",
  investment_date: "2024-03-20",
  transaction_type: "follow_on",
  vehicle: "preferred",
  shares_acquired: 1360,
  price_per_share_local: 36742.19,
  currency: "INR",
  cash_invested_local: 49_969_378,
  cash_invested_fund: 600_000, // USD
  fx_rate_at_entry: 0.012,
  ownership_at_entry_pct: 1.2,
  rights_and_terms: null,
  moic_on_prior_lot: null,
  overwrote_term_sheet: false,
  status: "active",
  created_at: "2024-03-20T00:00:00Z",
  updated_at: "2026-01-19T00:00:00Z",
};
investmentLots.push(slF1Lot);

deals.push({
  id: "deal-sl-f1",
  fund_id: F1,
  company_id: "co-sl",
  stage: "post_investment",
  source: "partner_referral",
  deal_owner_id: null,
  deal_owner: "Investment Team",
  deal_lead: "Partner Network",
  deal_lead_id: null,
  expected_investment: 600_000,
  committed_amount: 600_000,
  wired_amount: 600_000,
  currency: "USD",
  expected_close_date: "2024-03-20",
  actual_close_date: "2024-03-20",
  is_first_investment: false,
  notes: "Fund I follow-on into Super Living Series A.",
  created_at: "2024-03-20T00:00:00Z",
  updated_at: "2024-03-20T00:00:00Z",
});

termSheets.push({
  id: "ts-sl-f1",
  deal_id: "deal-sl-f1",
  round_id: "round-sl",
  side: "ours",
  status: "signed",
  vehicle: "preferred",
  proposed_investment_local: 49_969_378,
  currency: "INR",
  tentative_fx_rate: 0.012,
  proposed_investment_fund: 600_000,
  indicated_valuation_local: 4_500_000_000,
  is_post_money: true,
  implied_price_per_share: 36742.19,
  rights_and_terms: null,
  round_name: "Series A",
  moic_at_entry: 1,
  signed_at: "2024-02-15T00:00:00Z",
  investment_lot_id: "lot-sl-f1",
  created_at: "2024-02-15T00:00:00Z",
});

// Snapshots for SL F1 lot at the two USD-relevant marks
positionSnapshots.push(
  buildSnapshot({
    id: "snap-lot-sl-f1-2024-08-29",
    lot: slF1Lot,
    snapshot_date: "2024-08-29",
    mark_price_per_share_local: 36742.19,
    fx_rate_at_mark: 0.012,
    as_converted_shares: 1360,
    ownership_pct_at_event: 1.2,
    valuation_mark_id: "mark-co-sl-2024-08-29",
    notes: "Super Living — Fund I USD reporting",
  })
);
positionSnapshots.push(
  buildSnapshot({
    id: "snap-lot-sl-f1-2025-10-10",
    lot: slF1Lot,
    snapshot_date: "2025-10-10",
    mark_price_per_share_local: 73127.74,
    fx_rate_at_mark: 0.0121,
    as_converted_shares: 1360,
    ownership_pct_at_event: 1.2,
    valuation_mark_id: "mark-co-sl-2025-10-10",
    notes: "Super Living — Fund I USD reporting",
  })
);

// -----------------------------------------------------------------
// Pure-pipeline deals (no lot yet) to populate the deployment pipeline
// -----------------------------------------------------------------

interface PipelineSpec {
  id: string;
  name: string;
  fund: string;
  currency: string;
  stage: DealStage;
  source: DealSource;
  lead: string;
  owner: string;
  expected: number;
  expClose: string;
}

const PIPELINE: PipelineSpec[] = [
  { id: "deal-pipe-1", name: "Cobalt Labs", fund: F2, currency: "INR", stage: "investment_committee", source: "inbound", lead: "Aarav Jain", owner: "Investment Team", expected: 40_000_000, expClose: "2026-08-15" },
  { id: "deal-pipe-2", name: "Drift Analytics", fund: F2, currency: "INR", stage: "second_call", source: "partner_referral", lead: "Neha Verma", owner: "Investment Team", expected: 25_000_000, expClose: "2026-09-30" },
  { id: "deal-pipe-3", name: "Pinnacle Bio", fund: F1, currency: "USD", stage: "closing", source: "outbound", lead: "Aarav Jain", owner: "Investment Team", expected: 750_000, expClose: "2026-07-28" },
  { id: "deal-pipe-4", name: "Fathom AI", fund: F2, currency: "INR", stage: "first_call", source: "inbound", lead: "Neha Verma", owner: "Investment Team", expected: 30_000_000, expClose: "2026-10-20" },
  { id: "deal-pipe-5", name: "Harbor Logistics", fund: F2, currency: "INR", stage: "sourcing", source: "external_lead", lead: "Aarav Jain", owner: "Investment Team", expected: 20_000_000, expClose: "2026-11-15" },
  { id: "deal-pipe-6", name: "Slate Security", fund: F1, currency: "USD", stage: "second_call", source: "inbound", lead: "Neha Verma", owner: "Investment Team", expected: 500_000, expClose: "2026-09-10" },
];

for (const p of PIPELINE) {
  deals.push({
    id: p.id,
    fund_id: p.fund,
    company_id: null,
    stage: p.stage,
    source: p.source,
    deal_owner_id: null,
    deal_owner: p.owner,
    deal_lead: p.lead,
    deal_lead_id: null,
    expected_investment: p.expected,
    committed_amount: null,
    wired_amount: null,
    currency: p.currency,
    expected_close_date: p.expClose,
    actual_close_date: null,
    is_first_investment: true,
    notes: `${p.name} — prospective ${p.currency} investment.`,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  });
  dealStageHistory.push({
    id: `dsh-${p.id}`,
    deal_id: p.id,
    from_stage: "sourcing",
    to_stage: p.stage,
    changed_by: null,
    changed_at: "2026-06-20T00:00:00Z",
    notes: `${p.name} advanced to ${p.stage}.`,
  });
}

// -----------------------------------------------------------------
// Pending term sheets awaiting signature (operational priority)
// -----------------------------------------------------------------

termSheets.push({
  id: "ts-pipe-1",
  deal_id: "deal-pipe-1",
  round_id: null,
  side: "ours",
  status: "pending",
  vehicle: "ccps",
  proposed_investment_local: 40_000_000,
  currency: "INR",
  tentative_fx_rate: 1,
  proposed_investment_fund: 40_000_000,
  indicated_valuation_local: 500_000_000,
  is_post_money: true,
  implied_price_per_share: 45000,
  rights_and_terms: { liquidation_pref: "1x non-participating", pro_rata: true },
  round_name: "Series A",
  moic_at_entry: 1,
  signed_at: null,
  investment_lot_id: null,
  created_at: "2026-06-25T00:00:00Z",
});

termSheets.push({
  id: "ts-pipe-3",
  deal_id: "deal-pipe-3",
  round_id: null,
  side: "ours",
  status: "draft",
  vehicle: "safe",
  proposed_investment_local: 62_500_000,
  currency: "USD",
  tentative_fx_rate: 83.33,
  proposed_investment_fund: 750_000,
  indicated_valuation_local: null,
  is_post_money: false,
  implied_price_per_share: null,
  rights_and_terms: { valuation_cap: "12000000", discount: "0.20" },
  round_name: "Seed",
  moic_at_entry: null,
  signed_at: null,
  investment_lot_id: null,
  created_at: "2026-06-28T00:00:00Z",
});

// -----------------------------------------------------------------
// Export assembled dataset
// -----------------------------------------------------------------

export const seedData: FundOSData = {
  fundBrands,
  funds,
  companies,
  founders,
  deals,
  dealStageHistory,
  rounds,
  roundInvestors,
  termSheets,
  investmentLots,
  valuationMarks,
  positionSnapshots,
  fxRates,
  realizations,
  documents: [],
};
