/**
 * LP report exports — Excel workbook + printable HTML (browser "Save as PDF").
 * All figures derived from existing calc helpers; nothing is invented here.
 */

import * as XLSX from "xlsx";
import type { FundOSData } from "@/lib/types";
import { allFundMetrics, allLotPositions, fundIrr } from "@/lib/calc";
import {
  buildLpReportHtml,
  defaultIntro,
  type LpReportOptions,
  type LpSectionId,
} from "@/lib/reporting/lp-report-html";

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
      "Invested": p.lot.investment_date ?? "",
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

export interface LpPdfOptions {
  fundId?: string | "all";
  sections?: LpSectionId[];
  asOf?: string;
  intro?: string;
  signoff?: string;
}

/**
 * Open a printable LP update in a new window (browser Print → Save as PDF).
 * Uses the same branded builder as the email so the PDF matches the inbox view.
 */
export function openLpUpdatePdf(data: FundOSData, opts: LpPdfOptions = {}) {
  const fundId = opts.fundId ?? "all";
  const asOf = opts.asOf ?? todayIso();
  const report: LpReportOptions = {
    fundId,
    sections: opts.sections ?? ["fundSummary", "positions", "realizations"],
    asOf,
    intro: opts.intro ?? defaultIntro(data, { fundId, asOf }),
    signoff: opts.signoff,
    forPrint: true,
  };

  const html = buildLpReportHtml(data, report);

  const win = window.open("", "_blank");
  if (!win) {
    throw new Error("Pop-up blocked — allow pop-ups to open the LP Update PDF.");
  }
  win.document.write(html);
  win.document.close();
}
