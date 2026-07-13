import type { FundOSData } from "@/lib/types";
import { pendingTermSheets, formatMoney, formatDate, humanize } from "@/lib/calc";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Badge, statusTone } from "@/components/ui/Badge";
import { FileSignature } from "lucide-react";

export function PendingTermSheets({ data }: { data: FundOSData }) {
  const sheets = pendingTermSheets(data);

  return (
    <Panel className="h-full">
      <PanelHeader
        title="Pending Term Sheets"
        subtitle="Awaiting signature"
        action={<Badge tone="pending">{sheets.length}</Badge>}
      />
      <div className="divide-y divide-line">
        {sheets.length === 0 && (
          <div className="p-4 text-2xs text-ink-faint">No pending term sheets.</div>
        )}
        {sheets.map(({ termSheet: ts, company, fund, deal }) => (
          <div key={ts.id} className="flex items-start gap-3 p-3.5">
            <span className="mt-0.5 text-ink-faint">
              <FileSignature className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13px] font-semibold text-ink">
                  {company?.brand_name ??
                    company?.legal_name ??
                    deal?.notes?.split(" — ")[0] ??
                    "Prospective deal"}
                </span>
                <Badge tone={statusTone(ts.status)}>{ts.status}</Badge>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-ink-muted">
                <span>{ts.round_name ?? "—"}</span>
                <span className="text-ink-faint">·</span>
                <span>{humanize(ts.vehicle)}</span>
                {fund && (
                  <>
                    <span className="text-ink-faint">·</span>
                    <span>{fund.code}</span>
                  </>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="tnum text-[13px] font-semibold text-ink">
                {formatMoney(ts.proposed_investment_fund, ts.currency, {
                  compact: true,
                })}
              </div>
              <div className="text-2xs text-ink-faint">
                {formatDate(ts.created_at, "medium")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
