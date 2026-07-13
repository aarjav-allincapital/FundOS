"use client";

import type { FundOSData } from "@/lib/types";
import { fxSummary, formatDate } from "@/lib/calc";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { RecordActions } from "@/components/forms/RecordActions";
export function FxSummary({ data }: { data: FundOSData }) {
  const rows = fxSummary(data);

  return (
    <Panel className="h-full">
      <PanelHeader
        title="FX Engine"
        subtitle="Reporting rates for marks & NAV"
        action={<Badge tone="outline">USD · INR</Badge>}
      />
      <Table>
        <THead>
          <TH>Pair</TH>
          <TH num>Rate</TH>
          <TH num>As Of</TH>
          <TH>Type</TH>
          <TH>Source</TH>
          <TH className="w-16" />
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.pair}>
              <TD strong className="font-mono">{r.pair}</TD>
              <TD num>
                {r.rate.toLocaleString("en-US", {
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 6,
                })}
              </TD>
              <TD num muted>{formatDate(r.rate_date)}</TD>
              <TD muted className="capitalize">{r.purpose}</TD>
              <TD muted>{r.source ?? "—"}</TD>
              <TD>
                {r.purpose !== "transaction" && (
                  <RecordActions mode="fx" recordId={r.id} />
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <div className="border-t border-line px-4 py-2.5 text-2xs text-ink-faint">
        Transaction FX locks at investment entry. Reporting FX refreshes on
        valuations and snapshots. Manual rates override reporting.
      </div>
    </Panel>
  );
}
