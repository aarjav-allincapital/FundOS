/**
 * LP email drafts + delivery.
 *
 * A draft holds the editable state from the composer (recipients, subject,
 * intro, fund, sections). The branded HTML/text is rendered on demand from
 * {@link ./lp-report-html} so the email, PDF and preview stay identical.
 *
 * Delivery: `sendLpEmail` posts to `/api/reporting/send` (Resend, org-gated);
 * `openMailto` / `copyLpEmail` remain as offline fallbacks.
 */

import type { FundOSData } from "@/lib/types";
import {
  buildLpReportHtml,
  buildLpReportText,
  defaultIntro,
  defaultSubject,
  type LpReportOptions,
  type LpSectionId,
} from "./lp-report-html";

export { LP_SECTIONS } from "./lp-report-html";
export type { LpSectionId } from "./lp-report-html";

export interface LpEmailDraft {
  to: string[];
  subject: string;
  intro: string;
  fundId: string | "all";
  sections: LpSectionId[];
  asOf: string;
  signoff: string;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function newDraft(
  data: FundOSData,
  opts: { fundId?: string | "all"; asOf?: string; sections: LpSectionId[] },
): LpEmailDraft {
  const fundId = opts.fundId ?? "all";
  const asOf = opts.asOf ?? todayIso();
  return {
    to: [],
    subject: defaultSubject(data, { fundId, asOf }),
    intro: defaultIntro(data, { fundId, asOf }),
    fundId,
    sections: opts.sections,
    asOf,
    signoff: "All In Capital",
  };
}

function toReportOptions(draft: LpEmailDraft, forPrint = false): LpReportOptions {
  return {
    fundId: draft.fundId,
    sections: draft.sections,
    asOf: draft.asOf,
    intro: draft.intro,
    signoff: draft.signoff,
    forPrint,
  };
}

export function buildDraftHtml(data: FundOSData, draft: LpEmailDraft): string {
  return buildLpReportHtml(data, toReportOptions(draft));
}

export function buildDraftText(data: FundOSData, draft: LpEmailDraft): string {
  return buildLpReportText(data, toReportOptions(draft));
}

export function buildPrintHtml(data: FundOSData, draft: LpEmailDraft): string {
  return buildLpReportHtml(data, toReportOptions(draft, true));
}

/** Offline fallback — open the system mail client with the plain-text body. */
export function openMailto(data: FundOSData, draft: LpEmailDraft): void {
  const href =
    `mailto:${draft.to.join(",")}` +
    `?subject=${encodeURIComponent(draft.subject)}` +
    `&body=${encodeURIComponent(buildDraftText(data, draft))}`;
  window.location.href = href;
}

export async function copyLpEmail(data: FundOSData, draft: LpEmailDraft): Promise<void> {
  const text = `To: ${draft.to.join(", ")}\nSubject: ${draft.subject}\n\n${buildDraftText(data, draft)}`;
  await navigator.clipboard.writeText(text);
}

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

/** Send the branded HTML email to selected LPs via the Resend-backed API. */
export async function sendLpEmail(
  data: FundOSData,
  draft: LpEmailDraft,
): Promise<SendResult> {
  const recipients = draft.to.map((s) => s.trim()).filter(Boolean);
  if (recipients.length === 0) {
    return { ok: false, error: "Add at least one recipient." };
  }

  try {
    const res = await fetch("/api/reporting/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to: recipients,
        subject: draft.subject,
        html: buildDraftHtml(data, draft),
        text: buildDraftText(data, draft),
      }),
    });
    const json = (await res.json().catch(() => null)) as
      | { ok: boolean; id?: string | null; error?: string }
      | null;
    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.error ?? `Send failed (${res.status}).` };
    }
    return { ok: true, id: json.id ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}
