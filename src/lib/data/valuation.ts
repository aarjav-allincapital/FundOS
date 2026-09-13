/**
 * Valuation-mark semantics shared by the mutation, update, and display layers.
 *
 * The key rule: an OPEN-round term sheet (external_mark + "termsheet") is
 * informational — it records the proposed pre/post-money and price but must
 * NOT move NAV or the company's last-approved price. Every other mark type
 * (entry_round, closed external_mark, write_down, write_off) reprices.
 */

import type { FundOSData, MarkStatus, ValuationMark, ValuationType } from "@/lib/types";

/** Whether a mark should reprice NAV + the company's last-approved price. */
export function markReprices(
  valuationType: ValuationType,
  markStatus: MarkStatus | null | undefined,
): boolean {
  return !(valuationType === "external_mark" && markStatus === "termsheet");
}

/**
 * The company's currently-open round, if any — i.e. the most recent mark is an
 * external term sheet that hasn't been closed (or superseded by a later mark).
 * Returns null when there's no open round.
 */
export function companyOpenRound(
  data: Pick<FundOSData, "valuationMarks">,
  companyId: string,
): ValuationMark | null {
  const latest = data.valuationMarks
    .filter((m) => m.company_id === companyId)
    .sort((a, b) => (a.valuation_date < b.valuation_date ? 1 : -1))[0];
  if (!latest) return null;
  return latest.valuation_type === "external_mark" &&
    latest.mark_status === "termsheet"
    ? latest
    : null;
}
