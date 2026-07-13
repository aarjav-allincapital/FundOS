"use client";

import type { FundOSData } from "@/lib/types";
import {
  formatMoney,
  formatMultiple,
  formatDate,
  formatPrice,
  humanize,
} from "@/lib/calc";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { Badge, statusTone } from "@/components/ui/Badge";
import { RecordActions } from "@/components/forms/RecordActions";
import { RecentActivity } from "@/components/dashboard/RecentActivity";

export function SnapshotsAndLogs({ data }: { data: FundOSData }) {
  const snapshots = [...data.positionSnapshots].sort((a, b) =>
    a.snapshot_date < b.snapshot_date ? 1 : -1
  );
  const marks = [...data.valuationMarks].sort((a, b) =>
    a.valuation_date < b.valuation_date ? 1 : -1
  );

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader
          title="Position Snapshots"
          subtitle={`${snapshots.length} records · FMV, MOIC and unrealized gain/loss per lot`}
        />
        {snapshots.length === 0 ? (
          <Empty message="No snapshots yet. Add an investment lot and valuation mark, or add a snapshot manually." />
        ) : (
          <Table>
            <THead>
              <TH>Snapshot ID</TH>
              <TH num>Date</TH>
              <TH num>Shares</TH>
              <TH num>Mark PPS</TH>
              <TH num>FMV (Fund)</TH>
              <TH num>Unrealized</TH>
              <TH num>MOIC</TH>
              <TH className="w-16" />
            </THead>
            <TBody>
              {snapshots.map((s) => {
                const lot = data.investmentLots.find((l) => l.id === s.lot_id);
                const fund = lot
                  ? data.funds.find((f) => f.id === lot.fund_id)
                  : null;
                return (
                  <TR key={s.id}>
                    <TD strong className="text-2xs">
                      {s.snapshot_code}
                    </TD>
                    <TD num muted>{formatDate(s.snapshot_date)}</TD>
                    <TD num muted>{s.as_converted_shares}</TD>
                    <TD num>{formatPrice(s.mark_price_per_share_local, s.currency)}</TD>
                    <TD num strong>
                      {formatMoney(s.fmv_fund, fund?.currency ?? "INR", {
                        compact: true,
                      })}
                    </TD>
                    <TD num className={s.unrealized_gain_loss_fund >= 0 ? "text-gain" : "text-loss"}>
                      {formatMoney(s.unrealized_gain_loss_fund, fund?.currency ?? "INR", {
                        compact: true,
                        signed: true,
                      })}
                    </TD>
                    <TD num strong>{formatMultiple(s.moic_at_snapshot)}</TD>
                    <TD>
                      <RecordActions mode="snapshot" recordId={s.id} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Valuation Events"
          subtitle={`${marks.length} company-level marks`}
        />
        {marks.length === 0 ? (
          <Empty message="No valuation marks recorded." />
        ) : (
          <Table>
            <THead>
              <TH>Event Code</TH>
              <TH>Company</TH>
              <TH>Type</TH>
              <TH num>Price / Share</TH>
              <TH num>Post-Money</TH>
              <TH num>Date</TH>
              <TH>Status</TH>
              <TH className="w-16" />
            </THead>
            <TBody>
              {marks.map((m) => {
                const c = data.companies.find((x) => x.id === m.company_id);
                return (
                  <TR key={m.id}>
                    <TD muted className="text-2xs">{m.event_code}</TD>
                    <TD strong>{c?.brand_name ?? c?.legal_name}</TD>
                    <TD>
                      <Badge tone="neutral">{humanize(m.valuation_type)}</Badge>
                    </TD>
                    <TD num>{formatPrice(m.price_per_share_local, m.currency)}</TD>
                    <TD num muted>
                      {formatMoney(m.post_money_local, m.currency, { compact: true })}
                    </TD>
                    <TD num muted>{formatDate(m.valuation_date)}</TD>
                    <TD>
                      <Badge tone={statusTone(m.approval_status)}>
                        {m.approval_status}
                      </Badge>
                    </TD>
                    <TD>
                      <RecordActions mode="valuation" recordId={m.id} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Panel>

      <RecentActivity data={data} />
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <p className="p-6 text-center text-2xs text-ink-faint">{message}</p>
  );
}
