import type { FundOSData } from "@/lib/types";
import { allLotPositions, formatMoney, formatPercent } from "@/lib/calc";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Donut, type DonutSlice } from "@/components/charts/Donut";

// Neutral institutional ramp — greyscale with a single ink anchor.
const RAMP = ["#0A0A0A", "#3F3F3F", "#6B6B6B", "#949494", "#BDBDBD", "#DADADA"];

export function FundAllocation({ data }: { data: FundOSData }) {
  return (
    <Panel className="h-full">
      <PanelHeader
        title="Fund Allocation"
        subtitle="Current value by holding"
      />
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        {data.funds.map((fund) => {
          const positions = allLotPositions(data).filter(
            (p) => p.fund.id === fund.id && p.fmvFund > 0
          );
          const byCompany = new Map<string, { name: string; value: number }>();
          for (const p of positions) {
            const key = p.company.id;
            const cur = byCompany.get(key) ?? {
              name: p.company.brand_name ?? p.company.legal_name,
              value: 0,
            };
            cur.value += p.fmvFund;
            byCompany.set(key, cur);
          }
          const sorted = Array.from(byCompany.values()).sort(
            (a, b) => b.value - a.value
          );
          const top = sorted.slice(0, 5);
          const restVal = sorted.slice(5).reduce((s, x) => s + x.value, 0);
          const slices: DonutSlice[] = top.map((t, i) => ({
            name: t.name,
            value: t.value,
            color: RAMP[i] ?? "#BDBDBD",
          }));
          if (restVal > 0)
            slices.push({ name: "Others", value: restVal, color: RAMP[5] });
          const total = slices.reduce((s, x) => s + x.value, 0);

          return (
            <div key={fund.id} className="flex flex-col items-center">
              <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-faint">
                {fund.name} · {fund.code}
              </div>
              <div className="flex items-center gap-4">
                <Donut
                  data={slices}
                  size={112}
                  centerValue={formatMoney(total, fund.currency, { compact: true })}
                  centerLabel="NAV"
                />
                <div className="flex flex-col gap-1">
                  {slices.map((s) => (
                    <div key={s.name} className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-sm"
                        style={{ background: s.color }}
                      />
                      <span className="max-w-24 truncate text-2xs text-ink-muted">
                        {s.name}
                      </span>
                      <span className="tnum text-2xs text-ink-faint">
                        {formatPercent(total > 0 ? (s.value / total) * 100 : 0, {
                          decimals: 0,
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
