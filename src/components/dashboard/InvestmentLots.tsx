"use client";

import { useState } from "react";
import type { FundOSData } from "@/lib/types";
import {
  allLotPositions,
  formatMoney,
  formatMultiple,
  formatNumber,
  humanize,
} from "@/lib/calc";
import { useFundOS } from "@/providers/FundOSProvider";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { Badge, statusTone } from "@/components/ui/Badge";
import { RecordActions } from "@/components/forms/RecordActions";
import { Delta } from "@/components/ui/Delta";

export function InvestmentLots({ data }: { data: FundOSData }) {
  const { mergeLots } = useFundOS();
  const positions = allLotPositions(data).sort((a, b) => b.fmvFund - a.fmvFund);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const chosen = positions.filter((p) => selected.has(p.lot.id));
  const mergeable =
    chosen.length >= 2 &&
    chosen.every(
      (p) =>
        p.company.id === chosen[0].company.id &&
        p.fund.id === chosen[0].fund.id &&
        p.lot.currency === chosen[0].lot.currency
    );
  const mismatch = chosen.length >= 2 && !mergeable;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function doMerge() {
    if (!mergeable) return;
    mergeLots(chosen.map((p) => p.lot.id));
    setSelected(new Set());
  }

  return (
    <Panel>
      <PanelHeader
        title="Investment Lots"
        subtitle={`${positions.length} investment lots`}
        action={
          selected.size > 0 ? (
            <div className="flex items-center gap-2">
              {mismatch && (
                <span className="text-2xs text-loss">
                  merge needs same company + fund + currency
                </span>
              )}
              <button
                type="button"
                onClick={doMerge}
                disabled={!mergeable}
                className="rounded bg-ink px-3 py-1.5 text-2xs font-semibold text-surface hover:bg-ink/90 disabled:opacity-50"
              >
                Merge {chosen.length}
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded border border-line px-2.5 py-1.5 text-2xs font-medium text-ink-muted hover:bg-surface-subtle"
              >
                Clear
              </button>
            </div>
          ) : (
            <Badge tone="outline">Ledger</Badge>
          )
        }
      />
      <Table>
        <THead>
          <TH className="w-8" />
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
              <TD>
                <input
                  type="checkbox"
                  checked={selected.has(p.lot.id)}
                  onChange={() => toggle(p.lot.id)}
                  title="Select to merge"
                />
              </TD>
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
