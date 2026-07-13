import type { FundOSData } from "@/lib/types";
import {
  pipelineByStage,
  activePipeline,
  formatMoney,
  formatDate,
  humanize,
} from "@/lib/calc";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Progress } from "@/components/ui/Progress";
import { Badge, statusTone } from "@/components/ui/Badge";
import { RecordActions } from "@/components/forms/RecordActions";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";

export function DeploymentPipeline({ data }: { data: FundOSData }) {
  const stages = pipelineByStage(data);
  const deals = activePipeline(data);
  const maxCount = Math.max(1, ...stages.map((s) => s.count));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <Panel className="lg:col-span-2">
        <PanelHeader title="Pipeline by Stage" subtitle="Live pre-close deals" />
        <div className="flex flex-col gap-3 p-4">
          {stages.map((s) => (
            <div key={s.stage} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-ink">{humanize(s.stage)}</span>
                <span className="tnum text-ink-muted">{s.count}</span>
              </div>
              <Progress value={s.count} max={maxCount} tone="ink" />
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="lg:col-span-3">
        <PanelHeader
          title="Active Deals"
          subtitle="Requiring action across both funds"
          action={<Badge tone="outline">{deals.length} open</Badge>}
        />
        <Table>
          <THead>
            <TH>Deal</TH>
            <TH>Stage</TH>
            <TH>Lead</TH>
            <TH num>Expected</TH>
            <TH num>Target Close</TH>
            <TH className="w-16" />
          </THead>
          <TBody>
            {deals.map(({ deal, fund }) => (
              <TR key={deal.id}>
                <TD strong>
                  {deal.notes?.split(" — ")[0] ?? "Untitled"}
                  <span className="ml-1.5 text-2xs text-ink-faint">{fund.code}</span>
                </TD>
                <TD>
                  <Badge tone={statusTone(deal.stage)}>{humanize(deal.stage)}</Badge>
                </TD>
                <TD muted>{deal.deal_lead ?? "—"}</TD>
                <TD num>
                  {formatMoney(deal.expected_investment, deal.currency, {
                    compact: true,
                  })}
                </TD>
                <TD num muted>{formatDate(deal.expected_close_date, "medium")}</TD>
                <TD>
                  <RecordActions mode="deal" recordId={deal.id} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Panel>
    </div>
  );
}
