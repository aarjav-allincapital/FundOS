"use client";

import type { FundOSData } from "@/lib/types";import {
  allLotPositions,
  formatMoney,
  formatMultiple,
  formatNumber,
  formatDate,
  humanize,
} from "@/lib/calc";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { Badge, statusTone } from "@/components/ui/Badge";
import { RecordActions } from "@/components/forms/RecordActions";
import { Delta } from "@/components/ui/Delta";
export function InvestmentLots({ data }: { data: FundOSData }) {
  const positions = allLotPositions(data).sort((a, b) => b.fmvFund - a.fmvFund);

  return (
    <Panel>
      <PanelHeader
        title="Investment Lots"
        subtitle={`${positions.length} investment lots`}
        action={<Badge tone="outline">Ledger</Badge>}
      />
      <Table>
        <THead>
          <TH>Lot Code</TH>
          <TH>Company</TH>
          <TH>Round</TH>
          <TH>Instrument</TH>
          <TH num>Shares</TH>
          <TH num>Cost</TH>
          <TH num>FMV</TH>
          <TH num>MOIC</TH>
          <TH num>Mark Δ</TH>
          <TH>Status</TH>
          <TH className="w-20" />
        </THead>
        <TBody>
          {positions.map((p) => (
            <TR key={p.lot.id}>
              <TD strong className="font-mono text-2xs">{p.lot.code}</TD>
              <TD>{p.company.brand_name ?? p.company.legal_name}</TD>
              <TD muted>{p.round?.round_name ?? "—"}</TD>
              <TD>
                <Badge tone="neutral">{humanize(p.lot.vehicle)}</Badge>
              </TD>
              <TD num muted>{formatNumber(p.lot.shares_acquired)}</TD>
              <TD num muted>
                {formatMoney(p.costBasisFund, p.fund.currency, { compact: true })}
              </TD>
              <TD num strong>
                {formatMoney(p.fmvFund, p.fund.currency, { compact: true })}
              </TD>
              <TD num strong>{formatMultiple(p.moic)}</TD>
              <TD num>
                <Delta value={p.markChangePct} showIcon={false} />
              </TD>
              <TD>
                <Badge tone={statusTone(p.lot.status)}>
                  {p.lot.status.replace("_", " ")}
                </Badge>
              </TD>
              <TD>
                <RecordActions mode="lot" recordId={p.lot.id} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}
