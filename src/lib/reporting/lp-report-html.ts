/**
 * Shared branded HTML builder for LP reports.
 *
 * The same markup is used for (a) the email sent via Resend, (b) the in-app
 * live preview, and (c) the printable "Save as PDF" window — so what an LP sees
 * in their inbox is exactly what is previewed and downloaded.
 *
 * All figures come from the existing calc helpers; nothing is invented here.
 * Styles are inlined so the markup survives email clients (Gmail/Outlook).
 */

import type { FundOSData } from "@/lib/types";
import {
  allFundMetrics,
  allLotPositions,
  fundIrr,
  formatMoney,
  formatMultiple,
  formatPercent,
  formatDate,
} from "@/lib/calc";

export type LpSectionId =
  | "fundSummary"
  | "positions"
  | "realizations"
  | "recentMarks";

export const LP_SECTIONS: {
  id: LpSectionId;
  label: string;
  hint: string;
  recommended: boolean;
}[] = [
  { id: "fundSummary", label: "Fund summary", hint: "NAV · MOIC · DPI · IRR", recommended: true },
  { id: "positions", label: "Top holdings", hint: "Largest positions by FMV", recommended: true },
  { id: "realizations", label: "Realizations", hint: "Recent exits & distributions", recommended: true },
  { id: "recentMarks", label: "Valuation marks", hint: "Latest approved marks", recommended: false },
];

const BRAND = {
  name: "All In Capital",
  red: "#F0524B",
  ink: "#111827",
  muted: "#6b7280",
  faint: "#9ca3af",
  line: "#e5e7eb",
  subtle: "#f3f4f6",
  // Cache-bust so email clients pick up the transparent, smaller logo.
  logoUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/company-logos/brand/all-in-red.png?v=3`
    : "/all-in-logo-red.png",
};

export interface LpReportOptions {
  fundId: string | "all";
  sections: LpSectionId[];
  asOf: string;
  /** Free-text intro from the composer — rendered as paragraphs. */
  intro: string;
  /** Sign-off name shown above the confidentiality line. */
  signoff?: string;
  /** Inject a print button + auto-print script (PDF window only). */
  forPrint?: boolean;
}

export function quarterLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${d.getFullYear()}`;
}

export function fundLabelFor(data: FundOSData, fundId: string | "all"): string {
  if (fundId === "all") return BRAND.name;
  const f = data.funds.find((x) => x.id === fundId);
  return f ? f.name : BRAND.name;
}

/** Default intro copy shown in the composer (editable). */
export function defaultIntro(data: FundOSData, opts: { fundId: string | "all"; asOf: string }): string {
  const label = fundLabelFor(data, opts.fundId);
  return (
    `Dear Limited Partners,\n\n` +
    `Please find below our ${quarterLabel(opts.asOf)} portfolio update for ${label}, as of ${formatDate(opts.asOf, "medium")}. ` +
    `The highlights below summarise fund performance and notable activity across the portfolio.\n\n` +
    `As always, we're happy to share the detailed position schedule or set up a call if useful.`
  );
}

export function defaultSubject(data: FundOSData, opts: { fundId: string | "all"; asOf: string }): string {
  return `${fundLabelFor(data, opts.fundId)} — ${quarterLabel(opts.asOf)} LP Update`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function logoCell(logoUrl: string | null, updatedAt: string | null, name: string): string {
  const abbr = esc(name.slice(0, 2).toUpperCase());
  if (logoUrl) {
    const src = updatedAt ? `${logoUrl}?v=${encodeURIComponent(updatedAt)}` : logoUrl;
    return `<img src="${esc(src)}" alt="" width="20" height="20" style="border-radius:5px;object-fit:cover;vertical-align:middle;margin-right:8px;border:1px solid ${BRAND.line};" />`;
  }
  return `<span style="display:inline-block;width:20px;height:20px;border-radius:5px;background:${BRAND.subtle};border:1px solid ${BRAND.line};color:${BRAND.muted};font-size:9px;font-weight:700;text-align:center;line-height:20px;vertical-align:middle;margin-right:8px;">${abbr}</span>`;
}

function introHtml(intro: string): string {
  const paras = intro
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paras
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${BRAND.ink};">${esc(
          p,
        ).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
}

function sectionTitle(text: string): string {
  return `<h2 style="margin:28px 0 12px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.red};">${esc(
    text,
  )}</h2>`;
}

function fundSummaryHtml(data: FundOSData, fundId: string | "all"): string {
  const metrics = allFundMetrics(data).filter((m) => fundId === "all" || m.fund.id === fundId);
  if (metrics.length === 0) return "";
  const cards = metrics
    .map((m) => {
      const { grossIrr, netIrr } = fundIrr(data, m.fund);
      const kpi = (label: string, value: string) =>
        `<td style="padding:6px 14px 6px 0;vertical-align:top;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.04em;color:${BRAND.faint};">${label}</div>
          <div style="font-size:15px;font-weight:700;color:${BRAND.ink};font-variant-numeric:tabular-nums;">${value}</div>
        </td>`;
      return `
      <div style="border:1px solid ${BRAND.line};border-radius:10px;padding:14px 16px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:700;color:${BRAND.ink};margin-bottom:8px;">
          ${esc(m.fund.code)} <span style="font-weight:400;color:${BRAND.muted};">${esc(m.fund.name)}</span>
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
          <tr>
            ${kpi("NAV", formatMoney(m.currentNav, m.currency, { compact: true }))}
            ${kpi("Deployed", formatMoney(m.deployedCost, m.currency, { compact: true }))}
            ${kpi("Realized", formatMoney(m.realizedProceeds, m.currency, { compact: true }))}
            ${kpi("MOIC", formatMultiple(m.grossMoic))}
          </tr>
          <tr>
            ${kpi("DPI", formatMultiple(m.dpi))}
            ${kpi("Gross IRR", formatPercent(grossIrr, { fraction: true }))}
            ${kpi("Net IRR", formatPercent(netIrr, { fraction: true }))}
            ${kpi("Companies", String(m.companyCount))}
          </tr>
        </table>
      </div>`;
    })
    .join("");
  return sectionTitle("Fund summary") + cards;
}

function positionsHtml(data: FundOSData, fundId: string | "all", limit = 8): string {
  const positions = allLotPositions(data)
    .filter(
      (p) =>
        (p.lot.status === "active" || p.lot.status === "partial_exit") &&
        (fundId === "all" || p.fund.id === fundId),
    )
    .sort((a, b) => b.fmvFund - a.fmvFund)
    .slice(0, limit);
  if (positions.length === 0) return "";

  const rows = positions
    .map((p) => {
      const name = p.company.brand_name || p.company.legal_name;
      return `<tr>
        <td style="padding:8px 8px 8px 0;border-bottom:1px solid ${BRAND.line};font-size:13px;color:${BRAND.ink};">
          ${logoCell(p.company.logo_url, p.company.updated_at ?? null, name)}${esc(name)}
        </td>
        <td style="padding:8px;border-bottom:1px solid ${BRAND.line};font-size:12px;color:${BRAND.muted};">${esc(p.fund.code)}</td>
        <td style="padding:8px;border-bottom:1px solid ${BRAND.line};font-size:13px;color:${BRAND.ink};text-align:right;font-variant-numeric:tabular-nums;">${formatMoney(p.fmvFund, p.fund.currency, { compact: true })}</td>
        <td style="padding:8px 0 8px 8px;border-bottom:1px solid ${BRAND.line};font-size:13px;color:${BRAND.ink};text-align:right;font-variant-numeric:tabular-nums;">${formatMultiple(p.moic)}</td>
      </tr>`;
    })
    .join("");

  const th = (t: string, align = "left") =>
    `<th style="padding:6px 8px;text-align:${align};font-size:10px;text-transform:uppercase;letter-spacing:0.04em;color:${BRAND.faint};font-weight:600;border-bottom:1px solid ${BRAND.line};">${t}</th>`;

  return (
    sectionTitle("Top holdings") +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      <thead><tr>${th("Company")}${th("Fund")}${th("FMV", "right")}${th("MOIC", "right")}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`
  );
}

function realizationsHtml(data: FundOSData, fundId: string | "all", limit = 6): string {
  const reals = data.realizations
    .filter((r) => {
      if (fundId === "all") return true;
      const lot = data.investmentLots.find((l) => l.id === r.lot_id);
      return lot?.fund_id === fundId;
    })
    .sort((a, b) => (a.realization_date < b.realization_date ? 1 : -1))
    .slice(0, limit);
  if (reals.length === 0) return "";

  const rows = reals
    .map((r) => {
      const company = data.companies.find((c) => c.id === r.company_id);
      const name = company?.brand_name || company?.legal_name || "Company";
      return `<tr>
        <td style="padding:8px 8px 8px 0;border-bottom:1px solid ${BRAND.line};font-size:13px;color:${BRAND.ink};">
          ${logoCell(company?.logo_url ?? null, company?.updated_at ?? null, name)}${esc(name)}
        </td>
        <td style="padding:8px;border-bottom:1px solid ${BRAND.line};font-size:12px;color:${BRAND.muted};">${esc(formatDate(r.realization_date, "medium"))}</td>
        <td style="padding:8px;border-bottom:1px solid ${BRAND.line};font-size:12px;color:${BRAND.muted};text-transform:capitalize;">${esc(r.event_type.replace(/_/g, " "))}</td>
        <td style="padding:8px 0 8px 8px;border-bottom:1px solid ${BRAND.line};font-size:13px;color:${BRAND.ink};text-align:right;font-variant-numeric:tabular-nums;">${formatMoney(r.net_amount ?? 0, r.currency, { compact: true })}</td>
      </tr>`;
    })
    .join("");

  const th = (t: string, align = "left") =>
    `<th style="padding:6px 8px;text-align:${align};font-size:10px;text-transform:uppercase;letter-spacing:0.04em;color:${BRAND.faint};font-weight:600;border-bottom:1px solid ${BRAND.line};">${t}</th>`;

  return (
    sectionTitle("Realizations") +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      <thead><tr>${th("Company")}${th("Date")}${th("Type")}${th("Proceeds", "right")}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`
  );
}

function marksHtml(data: FundOSData, fundId: string | "all", limit = 6): string {
  const marks = data.valuationMarks
    .filter((m) => m.approval_status === "approved")
    .filter((m) => {
      if (fundId === "all") return true;
      return data.investmentLots.some((l) => l.company_id === m.company_id && l.fund_id === fundId);
    })
    .sort((a, b) => (a.valuation_date < b.valuation_date ? 1 : -1))
    .slice(0, limit);
  if (marks.length === 0) return "";

  const rows = marks
    .map((m) => {
      const company = data.companies.find((c) => c.id === m.company_id);
      const name = company?.brand_name || company?.legal_name || "Company";
      return `<tr>
        <td style="padding:8px 8px 8px 0;border-bottom:1px solid ${BRAND.line};font-size:13px;color:${BRAND.ink};">
          ${logoCell(company?.logo_url ?? null, company?.updated_at ?? null, name)}${esc(name)}
        </td>
        <td style="padding:8px;border-bottom:1px solid ${BRAND.line};font-size:12px;color:${BRAND.muted};">${esc(formatDate(m.valuation_date, "medium"))}</td>
        <td style="padding:8px 0 8px 8px;border-bottom:1px solid ${BRAND.line};font-size:12px;color:${BRAND.muted};text-transform:capitalize;">${esc(m.valuation_type.replace(/_/g, " "))}</td>
      </tr>`;
    })
    .join("");

  const th = (t: string) =>
    `<th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;color:${BRAND.faint};font-weight:600;border-bottom:1px solid ${BRAND.line};">${t}</th>`;

  return (
    sectionTitle("Valuation marks") +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      <thead><tr>${th("Company")}${th("Mark date")}${th("Method")}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`
  );
}

function sectionHtml(data: FundOSData, id: LpSectionId, fundId: string | "all"): string {
  switch (id) {
    case "fundSummary":
      return fundSummaryHtml(data, fundId);
    case "positions":
      return positionsHtml(data, fundId);
    case "realizations":
      return realizationsHtml(data, fundId);
    case "recentMarks":
      return marksHtml(data, fundId);
    default:
      return "";
  }
}

/** Build the full branded HTML document for email / preview / print. */
export function buildLpReportHtml(data: FundOSData, opts: LpReportOptions): string {
  const label = fundLabelFor(data, opts.fundId);
  const sectionsHtml = opts.sections.map((id) => sectionHtml(data, id, opts.fundId)).join("");

  const printBar = opts.forPrint
    ? `<div class="no-print" style="position:sticky;top:0;background:#fff;padding:12px 0;text-align:right;">
         <button onclick="window.print()" style="padding:8px 16px;border-radius:8px;border:0;background:${BRAND.red};color:#fff;font-weight:600;cursor:pointer;">Print / Save as PDF</button>
       </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(label)} — LP Update ${esc(opts.asOf)}</title>
<style>
  @media print { .no-print { display:none !important; } body { margin:0; } }
</style>
</head>
<body style="margin:0;background:${BRAND.subtle};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px 40px;">
    ${printBar}
    <div style="background:#fff;border:1px solid ${BRAND.line};border-radius:14px;overflow:hidden;">
      <!-- header: red top accent + centered logo on white (matches brand reference) -->
      <div style="background:#ffffff;border-top:4px solid ${BRAND.red};padding:22px 28px 18px;text-align:center;">
        <img src="${esc(BRAND.logoUrl)}" alt="${esc(BRAND.name)}" width="96" height="auto" style="width:96px;height:auto;display:inline-block;border:0;outline:none;" />
      </div>
      <div style="padding:24px 28px 8px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:${BRAND.faint};margin-bottom:4px;">${esc(quarterLabel(opts.asOf))} · LP Update</div>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:${BRAND.ink};">${esc(label)}</h1>
        <div style="font-size:13px;color:${BRAND.muted};">As of ${esc(formatDate(opts.asOf, "medium"))}</div>
      </div>
      <div style="padding:20px 28px 4px;">
        ${introHtml(opts.intro)}
      </div>
      <div style="padding:0 28px 24px;">
        ${sectionsHtml}
      </div>
      <!-- footer -->
      <div style="padding:20px 28px;border-top:1px solid ${BRAND.line};background:${BRAND.subtle};">
        <p style="margin:0 0 6px;font-size:13px;color:${BRAND.ink};">Best regards,</p>
        <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:${BRAND.ink};">${esc(opts.signoff || BRAND.name)}</p>
        <p style="margin:0;font-size:10px;line-height:1.5;color:${BRAND.faint};">
          Net IRR is a modeled fee/carry approximation (European-style), not an audited capital-account figure.
          Confidential — for limited partner use only. Generated by FundOS.
        </p>
      </div>
    </div>
  </div>
  ${opts.forPrint ? `<script>setTimeout(function(){window.print();},500);</script>` : ""}
</body>
</html>`;
}

/** Plain-text fallback for mailto / clipboard. */
export function buildLpReportText(data: FundOSData, opts: LpReportOptions): string {
  const label = fundLabelFor(data, opts.fundId);
  const lines: string[] = [opts.intro.trim(), ""];

  if (opts.sections.includes("fundSummary")) {
    const metrics = allFundMetrics(data).filter((m) => opts.fundId === "all" || m.fund.id === opts.fundId);
    if (metrics.length) {
      lines.push("FUND SUMMARY");
      for (const m of metrics) {
        const { grossIrr, netIrr } = fundIrr(data, m.fund);
        lines.push(
          `- ${m.fund.code} ${m.fund.name}: ${formatMoney(m.currentNav, m.currency)} NAV, ` +
            `${formatMultiple(m.grossMoic)} MOIC, ${formatMultiple(m.dpi)} DPI, ` +
            `${formatPercent(grossIrr, { fraction: true })} gross / ${formatPercent(netIrr, { fraction: true })} net IRR.`,
        );
      }
      lines.push("");
    }
  }

  if (opts.sections.includes("positions")) {
    const positions = allLotPositions(data)
      .filter(
        (p) =>
          (p.lot.status === "active" || p.lot.status === "partial_exit") &&
          (opts.fundId === "all" || p.fund.id === opts.fundId),
      )
      .sort((a, b) => b.fmvFund - a.fmvFund)
      .slice(0, 8);
    if (positions.length) {
      lines.push("TOP HOLDINGS");
      for (const p of positions) {
        const name = p.company.brand_name || p.company.legal_name;
        lines.push(`- ${name}: ${formatMoney(p.fmvFund, p.fund.currency)} FMV (${formatMultiple(p.moic)})`);
      }
      lines.push("");
    }
  }

  if (opts.sections.includes("realizations")) {
    const reals = data.realizations
      .filter((r) => {
        if (opts.fundId === "all") return true;
        const lot = data.investmentLots.find((l) => l.id === r.lot_id);
        return lot?.fund_id === opts.fundId;
      })
      .sort((a, b) => (a.realization_date < b.realization_date ? 1 : -1))
      .slice(0, 6);
    if (reals.length) {
      lines.push("REALIZATIONS");
      for (const r of reals) {
        const company = data.companies.find((c) => c.id === r.company_id);
        const name = company?.brand_name || company?.legal_name || "Company";
        lines.push(`- ${name} (${formatDate(r.realization_date, "medium")}): ${formatMoney(r.net_amount ?? 0, r.currency)}`);
      }
      lines.push("");
    }
  }

  lines.push("Best regards,");
  lines.push(opts.signoff || label);
  lines.push("");
  lines.push("Confidential — for limited partner use only.");
  return lines.join("\n");
}
