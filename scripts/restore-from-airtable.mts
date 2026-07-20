/**
 * Rebuild investment lots, valuation marks, position snapshots, rounds, and
 * deals from the REAL Airtable ledger (Companies / Investment Lots /
 * Valuation Events) — replacing the earlier reconstruction that used guessed
 * demo-seed numbers wearing real company names. See conversation for context.
 *
 * READ-ONLY against Airtable: every call below is a GET against the Airtable
 * REST API. This script must never POST/PATCH/PUT/DELETE to Airtable — it is
 * the team's live source system and is never to be written to from FundOS.
 *
 * Wipes and rebuilds: investment_lots, valuation_marks, position_snapshots,
 * rounds, deals. Leaves companies/founders/funds/fx_rates untouched.
 *
 * Run once: npx tsx scripts/restore-from-airtable.mts
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { addInvestmentLot, addValuationMark, type AddLotInput } from "@/lib/data/mutations";
import { buildSnapshot } from "@/lib/calc/snapshot";
import { FUND_IDS } from "@/lib/data/bootstrap";
import type { FundOSData, InstrumentType, InvestmentLot } from "@/lib/types";
import { readWriteFundOS } from "./lib/supabase-io";

const F2 = FUND_IDS.F2; // every real lot in this Airtable base sits in Fund II (INR)

interface AirtableRecord<T> {
  id: string;
  fields: T;
}

interface CompanyFields {
  "Entity Name": string;
}

interface LotFields {
  "Round Name": string;
  "Close Date": string;
  "Price Per Share at Entry": number;
  "Shares Purchased": number;
  Currency: string;
  "Instrument Type": string;
  "Gross Invested Amount": number;
  "Cost Basis in Fund Currency"?: number;
  "FX Rate at Close"?: number;
  "Entry Ownership Percent"?: number;
  Company: string[];
  "Investment Lot ID": number;
}

interface ValuationEventFields {
  "Price Per Share": number;
  "Event Type": string;
  "Event Date": string;
  Company: string[];
}

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

const VEHICLE_MAP: Record<string, InstrumentType> = {
  Preferred: "preferred",
  Note: "note",
  SAFE: "safe",
  Common: "common",
};

async function fetchAllAirtable<T>(baseId: string, apiKey: string, table: string): Promise<AirtableRecord<T>[]> {
  let records: AirtableRecord<T>[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    const json = await res.json();
    if (!res.ok) throw new Error(`${table}: ${JSON.stringify(json)}`);
    records.push(...json.records);
    offset = json.offset;
  } while (offset);
  return records;
}

/** Build one lot directly (bypassing the shares*price auto-calc) so cash figures
 *  match the Airtable ledger exactly, including real-world rounding. */
function buildLot(
  data: FundOSData,
  opts: {
    companyId: string;
    companyAbbr: string;
    sequence: number;
    roundName: string;
    investmentDate: string;
    vehicle: InstrumentType;
    shares: number;
    pricePerShare: number;
    currency: string;
    cashInvestedLocal: number;
    cashInvestedFund: number;
    fxRate: number;
    ownershipPct: number | null;
    dealId: string;
  },
): { lot: InvestmentLot; round: FundOSData["rounds"][number]; snapshot: FundOSData["positionSnapshots"][number] } {
  const fund = data.funds.find((f) => f.id === F2)!;
  const code = `${fund.vehicle_code}-${opts.companyAbbr}-${String(opts.sequence).padStart(4, "0")}`;
  const roundId = id("round");

  const round = {
    id: roundId,
    company_id: opts.companyId,
    deal_id: opts.dealId,
    round_name: opts.roundName,
    round_date: opts.investmentDate,
    our_role: "lead",
    status: "active" as const,
    price_per_share: opts.pricePerShare,
    currency: opts.currency,
    pre_money_local: null,
    post_money_local: null,
    pre_money_fund: null,
    post_money_fund: null,
    fx_rate: opts.fxRate,
    old_total_shares: null,
    new_shares_issued: opts.shares,
    new_total_shares: null,
    thesis_summary: null,
    created_at: new Date().toISOString(),
  };

  const lot: InvestmentLot = {
    id: id("lot"),
    fund_id: F2,
    company_id: opts.companyId,
    round_id: roundId,
    deal_id: opts.dealId,
    term_sheet_id: null,
    lot_sequence: opts.sequence,
    code: `AIC-${code}`,
    investment_date: opts.investmentDate,
    transaction_type: opts.sequence === 1 ? "primary" : "follow_on",
    vehicle: opts.vehicle,
    shares_acquired: opts.shares,
    price_per_share_local: opts.pricePerShare,
    currency: opts.currency,
    cash_invested_local: opts.cashInvestedLocal,
    cash_invested_fund: opts.cashInvestedFund,
    paid_in_capital_fund: opts.cashInvestedFund,
    fx_rate_at_entry: opts.fxRate,
    ownership_at_entry_pct: opts.ownershipPct,
    rights_and_terms: null,
    moic_on_prior_lot: null,
    overwrote_term_sheet: false,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const snapshot = buildSnapshot({
    lot,
    snapshot_date: opts.investmentDate,
    mark_price_per_share_local: opts.pricePerShare,
    fx_rate_at_mark: opts.fxRate,
    as_converted_shares: opts.shares,
    ownership_pct_at_event: opts.ownershipPct,
    notes: "Entry basis (restored from Airtable ledger).",
  });

  return { lot, round, snapshot };
}

async function main() {
  const env = Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );

  const airtableKey = env.AIRTABLE_API_KEY;
  const airtableBase = env.AIRTABLE_BASE_ID;
  if (!airtableKey || !airtableBase) throw new Error("Missing AIRTABLE_API_KEY / AIRTABLE_BASE_ID in .env.local");

  console.log("Fetching Airtable ledger…");
  const [atCompanies, atLots, atEvents] = await Promise.all([
    fetchAllAirtable<CompanyFields>(airtableBase, airtableKey, "Companies"),
    fetchAllAirtable<LotFields>(airtableBase, airtableKey, "Investment Lots"),
    fetchAllAirtable<ValuationEventFields>(airtableBase, airtableKey, "Valuation Events"),
  ]);
  console.log(`  ${atCompanies.length} companies, ${atLots.length} lots, ${atEvents.length} valuation events`);

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log("Loading current Supabase state…");
  let data = await readWriteFundOS.read(sb);
  console.log(
    `Before: ${data.companies.length} cos, ${data.investmentLots.length} lots, ${data.valuationMarks.length} marks, ${data.deals.length} deals`,
  );

  // Wipe everything this script rebuilds — all of it was reconstructed with
  // guessed/wrong numbers in the previous pass.
  data = {
    ...data,
    investmentLots: [],
    valuationMarks: [],
    positionSnapshots: [],
    rounds: [],
    deals: [],
    dealStageHistory: [],
  };

  // Map Airtable company record id -> Supabase company, by exact legal name.
  const nameToCompany = new Map(data.companies.map((c) => [c.legal_name.trim().toUpperCase(), c]));
  const atCompanyIdToCompany = new Map<string, (typeof data.companies)[number]>();
  for (const rec of atCompanies) {
    const name = rec.fields["Entity Name"]?.trim().toUpperCase();
    const match = name ? nameToCompany.get(name) : undefined;
    if (match) atCompanyIdToCompany.set(rec.id, match);
    else console.warn(`  no Supabase match for Airtable company "${rec.fields["Entity Name"]}"`);
  }

  // Group lots by company, sorted chronologically.
  const lotsByCompany = new Map<string, AirtableRecord<LotFields>[]>();
  for (const rec of atLots) {
    const companyAtId = rec.fields.Company?.[0];
    if (!companyAtId) continue;
    const list = lotsByCompany.get(companyAtId) ?? [];
    list.push(rec);
    lotsByCompany.set(companyAtId, list);
  }
  for (const list of lotsByCompany.values()) {
    list.sort((a, b) => (a.fields["Close Date"] < b.fields["Close Date"] ? -1 : 1));
  }

  // Group "New Priced Round" valuation events by company (real follow-on
  // repricing events — applied to all prior lots on that date).
  const repriceEventsByCompany = new Map<string, { date: string; price: number }[]>();
  for (const rec of atEvents) {
    if (rec.fields["Event Type"] !== "New Priced Round") continue;
    const companyAtId = rec.fields.Company?.[0];
    if (!companyAtId) continue;
    const list = repriceEventsByCompany.get(companyAtId) ?? [];
    list.push({ date: rec.fields["Event Date"], price: rec.fields["Price Per Share"] });
    repriceEventsByCompany.set(companyAtId, list);
  }

  let dealCount = 0;
  let lotCount = 0;
  let markCount = 0;

  for (const [atCompanyId, lotRecords] of lotsByCompany) {
    const company = atCompanyIdToCompany.get(atCompanyId);
    if (!company) continue;

    const dealId = id("deal");
    const totalInvested = lotRecords.reduce((s, r) => s + r.fields["Gross Invested Amount"], 0);
    const currency = lotRecords[0].fields.Currency;
    data = {
      ...data,
      deals: [
        ...data.deals,
        {
          id: dealId,
          fund_id: F2,
          company_id: company.id,
          stage: "post_investment",
          source: "internal_lead",
          deal_owner_id: null,
          deal_owner: null,
          deal_lead: null,
          deal_lead_id: null,
          expected_investment: totalInvested,
          committed_amount: totalInvested,
          wired_amount: totalInvested,
          currency,
          expected_close_date: lotRecords[0].fields["Close Date"],
          actual_close_date: lotRecords[lotRecords.length - 1].fields["Close Date"],
          is_first_investment: true,
          notes: "Restored from Airtable ledger.",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };
    dealCount++;

    let sequence = 1;
    const createdLotIds: string[] = [];
    for (const lotRec of lotRecords) {
      const f = lotRec.fields;
      const vehicle = VEHICLE_MAP[f["Instrument Type"]] ?? "preferred";
      const fx = f["FX Rate at Close"] ?? 1;
      const cashLocal = f["Gross Invested Amount"];
      const cashFund = f["Cost Basis in Fund Currency"] ?? cashLocal * fx;

      // If this isn't the company's first lot, reprice all its prior lots to
      // this round's entry price on this date — matches the observed pattern
      // where a new priced round marks up existing shares too.
      if (sequence > 1) {
        data = addValuationMark(data, {
          company_id: company.id,
          valuation_date: f["Close Date"],
          valuation_type: "round_pricing",
          price_per_share_local: f["Price Per Share at Entry"],
          approval_status: "approved",
        });
        markCount++;
      }

      const built = buildLot(data, {
        companyId: company.id,
        companyAbbr: company.abbr!,
        sequence,
        roundName: f["Round Name"],
        investmentDate: f["Close Date"],
        vehicle,
        shares: f["Shares Purchased"],
        pricePerShare: f["Price Per Share at Entry"],
        currency: f.Currency,
        cashInvestedLocal: cashLocal,
        cashInvestedFund: cashFund,
        fxRate: fx,
        ownershipPct: f["Entry Ownership Percent"] ?? null,
        dealId,
      });

      data = {
        ...data,
        rounds: [...data.rounds, built.round],
        investmentLots: [...data.investmentLots, built.lot],
        positionSnapshots: [...data.positionSnapshots, built.snapshot],
      };
      createdLotIds.push(built.lot.id);
      lotCount++;
      sequence++;
    }

    // Apply any documented "New Priced Round" events for this company that
    // land strictly between lot entries (defensive — usually already covered
    // by the reprice-on-next-entry step above).
    const events = (repriceEventsByCompany.get(atCompanyId) ?? []).sort((a, b) =>
      a.date < b.date ? -1 : 1,
    );
    const lastLotDate = lotRecords[lotRecords.length - 1].fields["Close Date"];
    for (const ev of events) {
      if (ev.date <= lastLotDate) continue; // already covered by reprice-on-entry above
      data = addValuationMark(data, {
        company_id: company.id,
        valuation_date: ev.date,
        valuation_type: "round_pricing",
        price_per_share_local: ev.price,
        approval_status: "approved",
      });
      markCount++;
    }

    // Freshest known mark: if the company's cached latest_mark_price (which
    // survived the wipe) is newer than every lot/event applied above, apply
    // it too so the dashboard reflects the most recent known NAV.
    if (
      company.latest_mark_price != null &&
      company.latest_mark_price_date &&
      company.latest_mark_price_date > lastLotDate &&
      (events.length === 0 || company.latest_mark_price_date > events[events.length - 1].date)
    ) {
      data = addValuationMark(data, {
        company_id: company.id,
        valuation_date: company.latest_mark_price_date,
        valuation_type: "internal_mark",
        price_per_share_local: company.latest_mark_price,
        approval_status: "approved",
      });
      markCount++;
    }

    console.log(`  ✓ ${company.abbr} (${company.legal_name}) — ${lotRecords.length} lot(s)`);
  }

  console.log(
    `After:  ${data.companies.length} cos, ${data.investmentLots.length} lots, ${data.valuationMarks.length} marks, ${data.deals.length} deals (rebuilt ${dealCount} deals, ${lotCount} lots, ${markCount} marks)`,
  );

  console.log("Writing rebuilt portfolio to Supabase…");
  await readWriteFundOS.write(sb, data);
  await readWriteFundOS.bumpSync(sb);
  console.log("Done — dashboard data rebuilt from the real Airtable ledger.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
