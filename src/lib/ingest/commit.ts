/**
 * Ingestion commit: turn reviewed ExtractedEntities into real records by
 * driving the EXISTING mutation functions (addCompany / addFounder /
 * addInvestmentLot / addValuationMark). Nothing here writes FundOSData
 * directly — every insert goes through the mutation layer, so FX resolution,
 * snapshot fan-out, and the paid-in/DPI invariants all stay authoritative.
 *
 * FX resolvers are INJECTED so this is unit-testable without the network; the
 * provider passes the real live-FX helpers from lib/fx/prepare.
 */

import type {
  Fund,
  FundOSData,
  InstrumentType,
  MarkStatus,
  ValuationType,
} from "@/lib/types";
import {
  addCompany,
  addFounder,
  addInvestmentLot,
  addValuationMark,
  type AddLotInput,
} from "@/lib/data/mutations";
import { calcCashInvestedLocal } from "@/lib/calc/lot";
import {
  dedupeCompanyIdentities,
  findDuplicateInvestmentLot,
  resolveCompany,
  withResolvedAlias,
} from "@/lib/data/entity-resolution";
import type {
  CommitSummary,
  ExtractedCompany,
  ExtractedEntities,
} from "@/lib/ingest/types";

export interface FxDeps {
  resolveTransactionFx: (data: FundOSData, input: AddLotInput) => Promise<number>;
  resolveReportingFxMap: (
    data: FundOSData,
    from: string,
    asOf: string,
    toCurrencies: string[]
  ) => Promise<Record<string, number>>;
}

export interface ApplyResult {
  data: FundOSData;
  summary: CommitSummary;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const INSTRUMENTS: InstrumentType[] = ["ccps", "preferred", "common", "safe", "note"];
function mapVehicle(raw: string | null | undefined): InstrumentType {
  const n = norm(raw);
  const hit = INSTRUMENTS.find((v) => n.includes(v));
  if (hit) return hit;
  if (n.includes("ccp")) return "ccps";
  return "ccps";
}

/**
 * Map an extracted valuation-type string onto the taxonomy. A term sheet on an
 * open round becomes an informational external mark; a priced/closed round (the
 * old "round_pricing" / "internal_mark") becomes a closed external mark unless
 * the text says we led ("entry"). Recovery of the exact intent from free text
 * is best-effort — closed external mark is the safe default.
 */
function mapValType(raw: string | null | undefined): {
  type: ValuationType;
  status: MarkStatus | null;
} {
  const n = norm(raw);
  // Write-offs are recorded as exits, not valuation marks — a documented
  // impairment/loss folds into a write_down (mark to the stated price).
  if (/(writ.?off|wrote.?off|total.?loss|writ.?down|impair|markdown|mark.?down)/.test(n)) {
    return { type: "write_down", status: null };
  }
  if (/(entry|we.?lead|lead.?invest|our.?round)/.test(n)) {
    return { type: "entry_round", status: null };
  }
  if (/(term.?sheet|ts.?issued|round.?open|open.?round|pending)/.test(n)) {
    return { type: "external_mark", status: "termsheet" };
  }
  return { type: "external_mark", status: "closed" };
}

/** Resolve a fund from an extracted code/vehicle, falling back to currency, then first fund. */
function resolveFund(
  data: FundOSData,
  fundCode: string | null | undefined,
  currency: string | null | undefined
): Fund | null {
  if (data.funds.length === 0) return null;
  const code = norm(fundCode);
  if (code) {
    const byCode = data.funds.find(
      (f) => norm(f.code) === code || norm(f.vehicle_code) === code
    );
    if (byCode) return byCode;
  }
  if (currency) {
    const byCcy = data.funds.find((f) => f.currency === currency);
    if (byCcy) return byCcy;
  }
  return data.funds[0];
}

function findExistingCompanyId(
  data: FundOSData,
  ec: ExtractedCompany
): string | undefined {
  return resolveCompany(data, ec)?.company.id;
}

/** Does a company with this name/brand already exist? (for review-time flagging) */
export function existingCompanyId(
  data: FundOSData,
  identity: string | ExtractedCompany,
): string | undefined {
  return resolveCompany(data, identity)?.company.id;
}

/** Does this founder already exist for an existing company? */
export function founderAlreadyExists(
  data: FundOSData,
  companyName: string,
  founderName: string
): boolean {
  const cid = existingCompanyId(data, companyName);
  if (!cid) return false;
  const key = norm(founderName);
  return data.founders.some((f) => f.company_id === cid && norm(f.name) === key);
}

export async function applyEntities(
  data: FundOSData,
  entities: ExtractedEntities,
  deps: FxDeps
): Promise<ApplyResult> {
  let working = data;

  const summary: CommitSummary = {
    companiesCreated: 0,
    companiesReused: 0,
    founders: 0,
    foundersReused: 0,
    lots: 0,
    lotsReused: 0,
    marks: 0,
    skipped: 0,
  };

  // Existing founders keyed by company + normalized name, so re-ingesting a
  // company you already hold doesn't duplicate its founders.
  const founderKey = (companyId: string, name: string) => `${companyId}|${norm(name)}`;
  const seenFounders = new Set(
    working.founders.map((f) => founderKey(f.company_id, f.name))
  );

  // Collapse within-batch name variants first ("Super Living" + "SuperLiving"),
  // then resolve each against the live portfolio.
  for (const ec of entities.companies) {
    if (!ec.legal_name?.trim()) summary.skipped++;
  }
  const companyBatch = dedupeCompanyIdentities(
    entities.companies.filter((ec) => Boolean(ec.legal_name?.trim())),
  );

  for (const ec of companyBatch) {
    const before = working.companies.length;
    const existed = Boolean(findExistingCompanyId(working, ec));
    // addCompany is idempotent and enriches the matched company with newly
    // encountered aliases and previously missing metadata.
    working = addCompany(working, {
      legal_name: ec.legal_name,
      brand_name: ec.brand_name ?? undefined,
      aliases: ec.aliases,
      sector: ec.sector ?? undefined,
      hq_city: ec.hq_city ?? undefined,
      hq_country: ec.hq_country ?? undefined,
      operating_currency: ec.operating_currency ?? "INR",
      website: ec.website ?? null,
    });
    if (existed || working.companies.length === before) {
      summary.companiesReused++;
    } else {
      summary.companiesCreated++;
    }
  }

  // Founders (deduped by company + name)
  for (const ef of entities.founders) {
    const match = resolveCompany(working, ef.company_name);
    const cid = match?.company.id;
    if (!cid || !ef.name?.trim()) { summary.skipped++; continue; }
    working = withResolvedAlias(working, cid, ef.company_name);
    const key = founderKey(cid, ef.name);
    if (seenFounders.has(key)) { summary.foundersReused++; continue; }
    working = addFounder(working, {
      company_id: cid,
      name: ef.name,
      role: ef.role ?? undefined,
      email: ef.email ?? undefined,
      linkedin_url: ef.linkedin_url ?? undefined,
    });
    seenFounders.add(key);
    summary.founders++;
  }

  // Lots
  for (const el of entities.lots) {
    const match = resolveCompany(working, el.company_name);
    const cid = match?.company.id;
    if (!cid || !el.investment_date) { summary.skipped++; continue; }
    working = withResolvedAlias(working, cid, el.company_name);
    const company = working.companies.find((c) => c.id === cid)!;
    const currency = el.currency ?? company.operating_currency ?? "INR";
    const fund = resolveFund(working, el.fund_code, currency);
    if (!fund) { summary.skipped++; continue; }

    const shares = el.shares_acquired ?? 0;
    const pps = el.price_per_share_local ?? 0;
    const cashLocal = el.cash_invested_local ?? calcCashInvestedLocal(shares, pps);
    if (cashLocal <= 0) { summary.skipped++; continue; }

    const input: AddLotInput = {
      fund_id: fund.id,
      company_id: cid,
      round_name: el.round_name || "Imported round",
      investment_date: el.investment_date,
      vehicle: mapVehicle(el.vehicle),
      shares_acquired: shares,
      price_per_share_local: pps,
      currency,
      cash_invested_local: cashLocal,
      ownership_at_entry_pct: el.ownership_at_entry_pct ?? undefined,
    };
    if (findDuplicateInvestmentLot(working, input)) {
      summary.lotsReused++;
      continue;
    }
    const fx = await deps.resolveTransactionFx(working, input);
    working = addInvestmentLot(working, { ...input, fx_rate_at_entry: fx });
    summary.lots++;
  }

  // Valuation marks (fan out to active lots via reporting FX)
  for (const em of entities.marks) {
    const match = resolveCompany(working, em.company_name);
    const cid = match?.company.id;
    if (!cid || !em.valuation_date || em.price_per_share_local == null) { summary.skipped++; continue; }
    working = withResolvedAlias(working, cid, em.company_name);
    const company = working.companies.find((c) => c.id === cid)!;
    const fundCurrencies = working.investmentLots
      .filter((l) => l.company_id === cid && l.status === "active")
      .map((l) => working.funds.find((fn) => fn.id === l.fund_id)!.currency);
    const reporting_fx = await deps.resolveReportingFxMap(
      working,
      company.operating_currency,
      em.valuation_date,
      fundCurrencies
    );
    const mapped = mapValType(em.valuation_type);
    working = addValuationMark(working, {
      company_id: cid,
      valuation_date: em.valuation_date,
      valuation_type: mapped.type,
      mark_status: mapped.status,
      price_per_share_local: em.price_per_share_local,
      shares: em.shares ?? undefined,
      pre_money_local: em.pre_money_local ?? undefined,
      post_money_local: em.post_money_local ?? undefined,
      reporting_fx,
    });
    summary.marks++;
  }

  return { data: working, summary };
}
