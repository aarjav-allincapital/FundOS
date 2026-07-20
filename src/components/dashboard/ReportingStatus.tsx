"use client";

import { useState } from "react";
import type { FundOSData } from "@/lib/types";
import {
  allFundMetrics,
  fundIrr,
  formatDate,
  formatMoney,
  formatPercent,
} from "@/lib/calc";
import { downloadLpExcel, openLpUpdatePdf } from "@/lib/reporting/lp-export";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { FileDown, FileSpreadsheet, Mail } from "lucide-react";

export function ReportingStatus({ data }: { data: FundOSData }) {
  const funds = allFundMetrics(data);
  const [exportError, setExportError] = useState<string | null>(null);
  const approvedMarks = data.valuationMarks.filter(
    (m) => m.approval_status === "approved"
  ).length;
  const pendingMarks = data.valuationMarks.length - approvedMarks;

  const lastNavByFund = funds.map((f) => {
    const dates = data.positionSnapshots
      .filter((s) =>
        data.investmentLots.some(
          (l) => l.id === s.lot_id && l.fund_id === f.fund.id
        )
      )
      .map((s) => s.snapshot_date)
      .sort();
    return { fund: f, lastNav: dates[dates.length - 1] ?? null };
  });

  function runExport(fn: () => void) {
    setExportError(null);
    try {
      fn();
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed.");
    }
  }

  return (
    <Panel className="h-full">
      <PanelHeader
        title="Reporting Status"
        subtitle="NAV readiness & LP exports"
        action={
          <Badge tone={pendingMarks ? "warn" : "gain"}>
            {pendingMarks ? `${pendingMarks} pending` : "All approved"}
          </Badge>
        }
      />
      <div className="grid grid-cols-2 gap-px bg-line">
        {lastNavByFund.map(({ fund, lastNav }) => {
          const { grossIrr, netIrr } = fundIrr(data, fund.fund);
          return (
            <div key={fund.fund.id} className="bg-surface p-4">
              <div className="text-2xs font-medium uppercase tracking-wide text-ink-faint">
                {fund.fund.code} — Latest NAV
              </div>
              <div className="mt-1 tnum text-lg font-semibold text-ink">
                {formatMoney(fund.currentNav, fund.currency, { compact: true })}
              </div>
              <div className="mt-0.5 text-2xs text-ink-muted">
                As of {formatDate(lastNav, "medium")}
              </div>
              <div className="mt-2 flex gap-4 border-t border-line pt-2">
                <IrrStat label="Gross IRR" value={formatPercent(grossIrr, { fraction: true })} />
                <IrrStat label="Net IRR" value={formatPercent(netIrr, { fraction: true })} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-line px-4 py-3">
        <div className="text-2xs text-ink-muted">
          <span className="tnum font-semibold text-ink">{approvedMarks}</span> marks
          approved · <span className="tnum font-semibold text-ink">{pendingMarks}</span> pending
        </div>
      </div>

      {exportError && (
        <p className="border-t border-line px-4 py-2 text-2xs text-loss">{exportError}</p>
      )}

      <div className="grid grid-cols-3 gap-2 border-t border-line p-3">
        <ExportButton
          icon={<FileDown className="h-3.5 w-3.5" />}
          label="PDF"
          onClick={() => runExport(() => openLpUpdatePdf(data))}
        />
        <ExportButton
          icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
          label="Excel"
          onClick={() => runExport(() => downloadLpExcel(data))}
        />
        <ExportButton
          icon={<Mail className="h-3.5 w-3.5" />}
          label="LP Update"
          onClick={() => runExport(() => openLpUpdatePdf(data))}
        />
      </div>
    </Panel>
  );
}

function IrrStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="tnum text-sm font-semibold text-ink">{value}</span>
      <span className="text-2xs text-ink-faint">{label}</span>
    </div>
  );
}

function ExportButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded border border-line bg-surface px-2 py-1.5 text-2xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
    >
      {icon}
      {label}
    </button>
  );
}
