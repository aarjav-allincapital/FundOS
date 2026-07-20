"use client";

import type { FundOSData } from "@/lib/types";
import {
  allFundMetrics,
  fundEventTimeline,
  fundIrr,
  formatMoney,
  formatMultiple,
  formatPercent,
} from "@/lib/calc";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Delta } from "@/components/ui/Delta";
import { MultiLineTimeline } from "@/components/charts/MultiLineTimeline";
import { EditButton } from "@/components/forms/EditButton";

export function FundOverview({ data }: { data: FundOSData }) {
  const metrics = allFundMetrics(data);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {metrics.map((m) => {
        const { series, events } = fundEventTimeline(data, m.fund);
        const { grossIrr, netIrr } = fundIrr(data, m.fund);
        const ccy = m.currency;
        const navGainPct =
          m.deployedCost > 0
            ? (m.unrealizedGain / m.deployedCost) * 100
            : null;
        return (
          <Panel key={m.fund.id}>
            <PanelHeader
              title={`${m.fund.name} · ${m.fund.code}`}
              subtitle={`Vintage ${m.fund.vintage_year ?? "—"} · ${ccy} · ${m.companyCount} companies`}
              action={
                <div className="flex items-center gap-1.5">
                  <Badge tone="gain" dot>
                    {m.fund.status}
                  </Badge>
                  <EditButton mode="fund" recordId={m.fund.id} label="Edit fund & economics" />
                </div>
              }
            />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 pt-4">
              <Field label="Current NAV">
                <span className="tnum text-lg font-semibold text-ink">
                  {formatMoney(m.currentNav, ccy, { compact: true })}
                </span>
              </Field>
              <Field label="Deployed">
                <span className="tnum text-lg font-semibold text-ink">
                  {formatMoney(m.deployedCost, ccy, { compact: true })}
                </span>
              </Field>
              <Field label="Unrealized Gain">
                <div className="flex items-baseline gap-2">
                  <span className="tnum text-sm font-semibold text-ink">
                    {formatMoney(m.unrealizedGain, ccy, { compact: true, signed: true })}
                  </span>
                  <Delta value={navGainPct} />
                </div>
              </Field>
              <Field label="Realized">
                <span className="tnum text-sm font-semibold text-ink">
                  {formatMoney(m.realizedProceeds, ccy, { compact: true })}
                </span>
              </Field>
            </div>

            <div className="mt-3 px-4 pb-1">
              <div className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-faint">
                Timeline · NAV, deployed & events
              </div>
              <MultiLineTimeline
                series={series}
                events={events}
                height={168}
                currency={ccy}
              />
            </div>

            <div className="mt-2 grid grid-cols-3 divide-x divide-line border-t border-line">
              <Stat label="Gross MOIC" value={formatMultiple(m.grossMoic)} />
              <Stat label="Unreal. MOIC" value={formatMultiple(m.unrealizedMoic)} />
              <Stat label="DPI" value={formatMultiple(m.dpi)} />
            </div>
            <div className="grid grid-cols-2 divide-x divide-line border-t border-line">
              <Stat
                label="Gross IRR"
                value={formatPercent(grossIrr, { fraction: true })}
              />
              <Stat
                label="Net IRR"
                value={formatPercent(netIrr, { fraction: true })}
              />
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xs font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 py-2.5">
      <span className="tnum text-sm font-semibold text-ink">{value}</span>
      <span className="text-2xs text-ink-faint">{label}</span>
    </div>
  );
}
