/**
 * Deal pipeline & term sheet derivations for the CRM/operational widgets.
 */

import type {
  Company,
  Deal,
  DealStage,
  Fund,
  FundOSData,
  TermSheet,
} from "@/lib/types";

/** Ordered pipeline stages that represent live (pre-close) work. */
export const ACTIVE_PIPELINE_STAGES: DealStage[] = [
  "sourcing",
  "first_call",
  "second_call",
  "investment_committee",
  "closing",
];

export const STAGE_ORDER: DealStage[] = [
  "sourcing",
  "first_call",
  "second_call",
  "investment_committee",
  "closing",
  "post_investment",
  "monitoring",
  "exit",
  "passed",
  "archived",
];

export interface DealView {
  deal: Deal;
  company: Company | null;
  fund: Fund;
}

export function dealViews(data: FundOSData): DealView[] {
  return data.deals.map((deal) => ({
    deal,
    company: data.companies.find((c) => c.id === deal.company_id) ?? null,
    fund: data.funds.find((f) => f.id === deal.fund_id)!,
  }));
}

export function activePipeline(data: FundOSData): DealView[] {
  return dealViews(data)
    .filter((d) => ACTIVE_PIPELINE_STAGES.includes(d.deal.stage))
    .sort(
      (a, b) =>
        STAGE_ORDER.indexOf(b.deal.stage) - STAGE_ORDER.indexOf(a.deal.stage)
    );
}

export interface StageBucket {
  stage: DealStage;
  count: number;
  expectedValue: number; // sum of expected_investment in deal currency
  deals: DealView[];
}

export function pipelineByStage(data: FundOSData): StageBucket[] {
  const views = dealViews(data);
  return ACTIVE_PIPELINE_STAGES.map((stage) => {
    const deals = views.filter((d) => d.deal.stage === stage);
    return {
      stage,
      count: deals.length,
      expectedValue: deals.reduce(
        (s, d) => s + (d.deal.expected_investment ?? 0),
        0
      ),
      deals,
    };
  });
}

export interface TermSheetView {
  termSheet: TermSheet;
  deal: Deal | null;
  company: Company | null;
  fund: Fund | null;
}

export function termSheetViews(data: FundOSData): TermSheetView[] {
  return data.termSheets.map((ts) => {
    const deal = data.deals.find((d) => d.id === ts.deal_id) ?? null;
    const company = deal
      ? data.companies.find((c) => c.id === deal.company_id) ?? null
      : null;
    const fund = deal ? data.funds.find((f) => f.id === deal.fund_id) ?? null : null;
    return { termSheet: ts, deal, company, fund };
  });
}

export function pendingTermSheets(data: FundOSData): TermSheetView[] {
  return termSheetViews(data)
    .filter(
      (t) => t.termSheet.status === "draft" || t.termSheet.status === "pending"
    )
    .sort((a, b) => (a.termSheet.created_at < b.termSheet.created_at ? 1 : -1));
}

/** Valuation marks awaiting approval — an operational priority. */
export function pendingValuationMarks(data: FundOSData) {
  return data.valuationMarks
    .filter((m) => m.approval_status !== "approved")
    .map((m) => ({
      mark: m,
      company: data.companies.find((c) => c.id === m.company_id) ?? null,
    }))
    .sort((a, b) => (a.mark.valuation_date < b.mark.valuation_date ? 1 : -1));
}
