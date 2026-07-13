"use client";

import type { FundOSData } from "@/lib/types";
import { recentValuationMarks, formatPrice, formatDate, formatMoney, humanize } from "@/lib/calc";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { Badge, statusTone } from "@/components/ui/Badge";
import { RecordActions } from "@/components/forms/RecordActions";

export function RecentValuationMarks({ data }: { data: FundOSData }) {
  const marks = recentValuationMarks(data, 8);

  return (
    <Panel className="h-full">
      <PanelHeader
        title="Recent Valuation Marks"
        subtitle="Company-level price events"
      />
      <Table>
        <THead>
          <TH>Event</TH>
          <TH>Company</TH>
          <TH>Type</TH>
          <TH num>Price / Share</TH>
          <TH num>Post-Money</TH>
          <TH num>Date</TH>
          <TH>Approval</TH>
          <TH className="w-16" />
        </THead>
        <TBody>
          {marks.map((m) => (
            <TR key={m.id}>
              <TD muted className="font-mono text-2xs">{m.event_code ?? "—"}</TD>
              <TD strong>{m.company?.brand_name ?? m.company?.legal_name ?? "—"}</TD>
              <TD>
                <Badge tone={m.valuation_type === "write_off" ? "loss" : "neutral"}>
                  {humanize(m.valuation_type)}
                </Badge>
              </TD>
              <TD num>{formatPrice(m.price_per_share_local, m.currency)}</TD>
              <TD num muted>
                {formatMoney(m.post_money_local, m.currency, { compact: true })}
              </TD>
              <TD num muted>{formatDate(m.valuation_date)}</TD>
              <TD>
                <Badge tone={statusTone(m.approval_status)}>{m.approval_status}</Badge>
              </TD>
              <TD>
                <RecordActions mode="valuation" recordId={m.id} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}
