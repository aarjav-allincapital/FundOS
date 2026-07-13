/**
 * Client-side record deletion with minimal cascade cleanup.
 */

import type { FundOSData } from "@/lib/types";

export type DeleteRecordKind =
  | "company"
  | "founder"
  | "deal"
  | "lot"
  | "valuation"
  | "snapshot"
  | "fx";

export function deleteCompany(data: FundOSData, id: string): FundOSData {
  const lotIds = data.investmentLots
    .filter((l) => l.company_id === id)
    .map((l) => l.id);

  return {
    ...data,
    companies: data.companies.filter((c) => c.id !== id),
    founders: data.founders.filter((f) => f.company_id !== id),
    deals: data.deals.filter((d) => d.company_id !== id),
    rounds: data.rounds.filter((r) => r.company_id !== id),
    investmentLots: data.investmentLots.filter((l) => l.company_id !== id),
    valuationMarks: data.valuationMarks.filter((m) => m.company_id !== id),
    positionSnapshots: data.positionSnapshots.filter((s) => !lotIds.includes(s.lot_id)),
  };
}

export function deleteFounder(data: FundOSData, id: string): FundOSData {
  return {
    ...data,
    founders: data.founders.filter((f) => f.id !== id),
  };
}

export function deleteDeal(data: FundOSData, id: string): FundOSData {
  return {
    ...data,
    deals: data.deals.filter((d) => d.id !== id),
  };
}

export function deleteInvestmentLot(data: FundOSData, id: string): FundOSData {
  const lot = data.investmentLots.find((l) => l.id === id);
  if (!lot) return data;

  const otherLotsOnRound = data.investmentLots.filter(
    (l) => l.id !== id && l.round_id === lot.round_id
  );
  const otherLotsOnDeal = data.investmentLots.filter(
    (l) => l.id !== id && l.deal_id === lot.deal_id
  );

  return {
    ...data,
    investmentLots: data.investmentLots.filter((l) => l.id !== id),
    positionSnapshots: data.positionSnapshots.filter((s) => s.lot_id !== id),
    rounds:
      lot.round_id && otherLotsOnRound.length === 0
        ? data.rounds.filter((r) => r.id !== lot.round_id)
        : data.rounds,
    deals:
      lot.deal_id && otherLotsOnDeal.length === 0
        ? data.deals.filter((d) => d.id !== lot.deal_id)
        : data.deals,
  };
}

export function deleteValuationMark(data: FundOSData, id: string): FundOSData {
  return {
    ...data,
    valuationMarks: data.valuationMarks.filter((m) => m.id !== id),
    positionSnapshots: data.positionSnapshots.filter(
      (s) => s.valuation_mark_id !== id
    ),
  };
}

export function deletePositionSnapshot(data: FundOSData, id: string): FundOSData {
  return {
    ...data,
    positionSnapshots: data.positionSnapshots.filter((s) => s.id !== id),
  };
}

export function deleteFxRate(data: FundOSData, id: string): FundOSData {
  return {
    ...data,
    fxRates: data.fxRates.filter((r) => r.id !== id),
  };
}

export function deleteRecord(
  data: FundOSData,
  kind: DeleteRecordKind,
  id: string
): FundOSData {
  switch (kind) {
    case "company":
      return deleteCompany(data, id);
    case "founder":
      return deleteFounder(data, id);
    case "deal":
      return deleteDeal(data, id);
    case "lot":
      return deleteInvestmentLot(data, id);
    case "valuation":
      return deleteValuationMark(data, id);
    case "snapshot":
      return deletePositionSnapshot(data, id);
    case "fx":
      return deleteFxRate(data, id);
  }
}
