/**
 * LP report exports — Excel workbook + printable HTML (browser "Save as PDF").
 * All figures derived from existing calc helpers; nothing is invented here.
 */

import * as XLSX from "xlsx";
import type { FundOSData } from "@/lib/types";
import {
  allFundMetrics,
  allLotPositions,
  fundIrr,
  formatMoney,
  formatMultiple,
  formatPercent,
} from "@/lib/calc";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fundSheet(data: FundOSData) {
  return allFundMetrics(data).map((f) => {
    const { grossIrr, netIrr } = fundIrr(data, f.fund);
    return {
      Fund: f.fund.code,
      Name: f.fund.name,
      Currency: f.currency,
      Companies: f.companyCount,
      "Active lots": f.activePositions,
      "Exited lots": f.exitedPositions,
      Deployed: f.deployedCost,
      NAV: f.currentNav,
      Realized: f.realizedProceeds,
      "Gross MOIC": Number(f.grossMoic.toFixed(4)),
      DPI: Number(f.dpi.toFixed(4)),
      "Gross IRR": grossIrr == null ? "" : Number(grossIrr.toFixed(6)),
      "Net IRR": netIrr == null ? "" : Number(netIrr.toFixed(6)),
    };
  });
}

function positionsSheet(data: FundOSData) {
  return allLotPositions(data)
    .filter((p) => p.lot.status === "active" || p.lot.status === "partial_exit")
    .map((p) => ({
      Fund: p.fund.code,
      Company: p.company.brand_name || p.company.legal_name,
      "Lot code": p.lot.code,
      Round: p.round?.round_name ?? "",
      Vehicle: p.lot.vehicle,
      Status: p.lot.status,
      Shares: p.lot.shares_acquired ?? 0,
      "Cost (fund)": Number(p.costBasisFund.toFixed(2)),
      "FMV (fund)": Number(p.fmvFund.toFixed(2)),
      MOIC: Number(p.moic.toFixed(4)),
      Currency: p.fund.currency,
      "Mark date": p.latest?.snapshot_date ?? "",
    }));
}

function realizationsSheet(data: FundOSData) {
  return data.realizations.map((r) => {
    const lot = data.investmentLots.find((l) => l.id === r.lot_id);
    const company = data.companies.find((c) => c.id === r.company_id);
    const fund = lot ? data.funds.find((f) => f.id === lot.fund_id) : null;
    return {
      Date: r.realization_date,
      Fund: fund?.code ?? "",
      Company: company?.brand_name || company?.legal_name || "",
      "Lot code": lot?.code ?? "",
      Type: r.event_type,
      Shares: r.shares_sold ?? 0,
      "Price / share": r.price_per_share ?? 0,
      Proceeds: r.net_amount ?? 0,
      Currency: r.currency,
    };
  });
}

/** Download a multi-sheet Excel workbook suitable for LP / IC packs. */
export function downloadLpExcel(data: FundOSData, asOf = todayIso()) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(fundSheet(data)),
    "Fund summary"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(positionsSheet(data)),
    "Positions"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(realizationsSheet(data)),
    "Realizations"
  );

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `FundOS-LP-Report-${asOf}.xlsx`
  );
}

/** Open a printable LP update in a new window (use browser Print → Save as PDF). */
export function openLpUpdatePdf(data: FundOSData, asOf = todayIso()) {
  const funds = allFundMetrics(data);
  const positions = allLotPositions(data).filter(
    (p) => p.lot.status === "active" || p.lot.status === "partial_exit"
  );

  const fundBlocks = funds
    .map((f) => {
      const { grossIrr, netIrr } = fundIrr(data, f.fund);
      return `
        <section class="fund">
          <h2>${escapeHtml(f.fund.code)} — ${escapeHtml(f.fund.name)}</h2>
          <table class="kpis">
            <tr>
              <td><span class="label">NAV</span><br/><strong>${formatMoney(f.currentNav, f.currency)}</strong></td>
              <td><span class="label">Deployed</span><br/><strong>${formatMoney(f.deployedCost, f.currency)}</strong></td>
              <td><span class="label">Realized</span><br/><strong>${formatMoney(f.realizedProceeds, f.currency)}</strong></td>
              <td><span class="label">Gross MOIC</span><br/><strong>${formatMultiple(f.grossMoic)}</strong></td>
              <td><span class="label">DPI</span><br/><strong>${formatMultiple(f.dpi)}</strong></td>
              <td><span class="label">Gross IRR</span><br/><strong>${formatPercent(grossIrr, { fraction: true })}</strong></td>
              <td><span class="label">Net IRR</span><br/><strong>${formatPercent(netIrr, { fraction: true })}</strong></td>
            </tr>
          </table>
        </section>`;
    })
    .join("");

  const rows = positions
    .map(
      (p) => `
      <tr>
        <td>${escapeHtml(p.fund.code)}</td>
        <td>${escapeHtml(p.company.brand_name || p.company.legal_name)}</td>
        <td class="mono">${escapeHtml(p.lot.code)}</td>
        <td>${escapeHtml(p.round?.round_name ?? "—")}</td>
        <td class="num">${formatMoney(p.costBasisFund, p.fund.currency)}</td>
        <td class="num">${formatMoney(p.fmvFund, p.fund.currency)}</td>
        <td class="num">${formatMultiple(p.moic)}</td>
        <td>${escapeHtml(p.lot.status)}</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>All In Capital — LP Update ${asOf}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #111; margin: 40px; font-size: 12px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .sub { color: #666; margin-bottom: 28px; }
    h2 { font-size: 14px; margin: 24px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    .kpis { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .kpis td { padding: 8px 10px 8px 0; vertical-align: top; }
    .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #888; }
    table.positions { width: 100%; border-collapse: collapse; margin-top: 8px; }
    table.positions th, table.positions td { border-bottom: 1px solid #eee; padding: 6px 8px; text-align: left; }
    table.positions th { font-size: 10px; text-transform: uppercase; color: #888; font-weight: 600; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .mono { font-family: ui-monospace, monospace; font-size: 11px; }
    .foot { margin-top: 32px; font-size: 10px; color: #999; }
    @media print {
      body { margin: 16px; }
      button { display: none !important; }
    }
  </style>
</head>
<body>
  <button onclick="window.print()" style="float:right;padding:8px 14px;cursor:pointer;">Print / Save as PDF</button>
  <h1>All In Capital — LP Update</h1>
  <p class="sub">As of ${asOf} · Generated by FundOS</p>
  ${fundBlocks}
  <h2>Active positions</h2>
  <table class="positions">
    <thead>
      <tr>
        <th>Fund</th><th>Company</th><th>Lot</th><th>Round</th>
        <th class="num">Cost</th><th class="num">FMV</th><th class="num">MOIC</th><th>Status</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="8">No active positions.</td></tr>`}</tbody>
  </table>
  <p class="foot">
    Net IRR is a modeled fee/carry approximation (European-style), not an audited capital-account figure.
    Confidential — All In Capital.
  </p>
  <script>setTimeout(() => window.print(), 400);</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) {
    throw new Error("Pop-up blocked — allow pop-ups to open the LP Update PDF.");
  }
  win.document.write(html);
  win.document.close();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
