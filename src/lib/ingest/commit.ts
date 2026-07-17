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
  Company,
  Fund,
  FundOSData,
  InstrumentType,
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

const VAL_TYPES: ValuationType[] = [
  "round_pricing",
  "internal_mark",
  "external_mark",
  "write_down",
  "write_off",
];
function mapValType(raw: string | null | undefined): ValuationType {
  const n = norm(raw);
  const hit = VAL_TYPES.find((v) => n === norm(v) || n.includes(norm(v)));
  return hit ?? "internal_mark";
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

/** Register a company's names so later founders/lots/marks can resolve to its id. */
function registerCompany(map: Map<string, string>, c: Company): void {
  if (c.legal_name) map.set(norm(c.legal_name), c.id);
  if (c.brand_name) map.set(norm(c.brand_name), c.id);
}

function findExistingCompanyId(
  map: Map<string, string>,
  ec: ExtractedCompany
): string | undefined {
  return map.get(norm(ec.legal_name)) ?? (ec.brand_name ? map.get(norm(ec.brand_name)) : undefined);
}

/** Does a company with this name/brand already exist? (for review-time flagging) */
export function existingCompanyId(data: FundOSData, name: string): string | undefined {
  const key = norm(name);
  const c = data.companies.find(
    (co) => norm(co.legal_name) === key || (co.brand_name != null && norm(co.brand_name) === key)
  );
  return c?.id;
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
  const nameToId = new Map<string, string>();
  working.companies.forEach((c) => registerCompany(nameToId, c));

  const summary: CommitSummary = {
    companiesCreated: 0,
    companiesReused: 0,
    founders: 0,
    foundersReused: 0,
    lots: 0,
    marks: 0,
    skipped: 0,
  };

  // Existing founders keyed by company + normalized name, so re-ingesting a
  // company you already hold doesn't duplicate its founders.
  const founderKey = (companyId: string, name: string) => `${companyId}|${norm(name)}`;
  const seenFounders = new Set(
    working.founders.map((f) => founderKey(f.company_id, f.name))
  );

  // Companies (dedup against existing + within this batch)
  for (const ec of entities.companies) {
    if (!ec.legal_name?.trim()) { summary.skipped++; continue; }
    if (findExistingCompanyId(nameToId, ec)) { summary.companiesReused++; continue; }
    working = addCompany(working, {
      legal_name: ec.legal_name,
      brand_name: ec.brand_name ?? undefined,
      sector: ec.sector ?? undefined,
      hq_city: ec.hq_city ?? undefined,
      hq_country: ec.hq_country ?? undefined,
      operating_currency: ec.operating_currency ?? "INR",
    });
    registerCompany(nameToId, working.companies[working.companies.length - 1]);
    summary.companiesCreated++;
  }

  // Founders (deduped by company + name)
  for (const ef of entities.founders) {
    const cid = nameToId.get(norm(ef.company_name));
    if (!cid || !ef.name?.trim()) { summary.skipped++; continue; }
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
    const cid = nameToId.get(norm(el.company_name));
    if (!cid || !el.investment_date) { summary.skipped++; continue; }
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
    const fx = await deps.resolveTransactionFx(working, input);
    working = addInvestmentLot(working, { ...input, fx_rate_at_entry: fx });
    summary.lots++;
  }

  // Valuation marks (fan out to active lots via reporting FX)
  for (const em of entities.marks) {
    const cid = nameToId.get(norm(em.company_name));
    if (!cid || !em.valuation_date || em.price_per_share_local == null) { summary.skipped++; continue; }
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
    working = addValuationMark(working, {
      company_id: cid,
      valuation_date: em.valuation_date,
      valuation_type: mapValType(em.valuation_type),
      price_per_share_local: em.price_per_share_local,
      post_money_local: em.post_money_local ?? undefined,
      reporting_fx,
    });
    summary.marks++;
  }

  return { data: working, summary };
}
