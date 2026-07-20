import type { FundOSData } from "@/lib/types";
import { allLotPositions, formatMoney, formatPercent, type LotPosition } from "@/lib/calc";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { cn } from "@/lib/cn";

export function ValueMovers({ data }: { data: FundOSData }) {
  const positions = allLotPositions(data)
    .map((p) => ({
      p,
      pct: p.costBasisFund > 0 ? (p.unrealizedFund / p.costBasisFund) * 100 : 0,
    }))
    .filter((x) => Number.isFinite(x.pct));

  const gainers = [...positions]
    .filter((x) => x.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);

  const maxAbs = Math.max(1, ...gainers.map((x) => Math.abs(x.pct)));

  return (
    <Panel className="h-full">
      <PanelHeader title="Portfolio" />
      <MoverList rows={gainers} maxAbs={maxAbs} tone="gain" />
    </Panel>
  );
}

function MoverList({
  rows,
  maxAbs,
  tone,
}: {
  rows: Array<{ p: LotPosition; pct: number }>;
  maxAbs: number;
  tone: "gain" | "loss";
}) {
  return (
    <div className="p-4">
      <div className="flex flex-col gap-2">
        {rows.length === 0 && (
          <span className="text-2xs text-ink-faint">No positions.</span>
        )}
        {rows.map(({ p, pct }) => {
          const width = Math.min(100, (Math.abs(pct) / maxAbs) * 100);
          return (
            <div key={p.lot.id} className="flex items-center gap-3">
              <div className="w-28 shrink-0">
                <div className="truncate text-[13px] font-medium text-ink">
                  {p.company.brand_name ?? p.company.legal_name}
                </div>
                <div className="text-2xs text-ink-faint">{p.fund.vehicle_code}</div>
              </div>
              <div className="relative h-4 flex-1 rounded-sm bg-surface-sunken">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-sm",
                    tone === "gain" ? "bg-gain/25" : "bg-loss/25"
                  )}
                  style={{ width: `${width}%` }}
                />
              </div>
              <div
                className={cn(
                  "w-16 shrink-0 text-right tnum text-[13px] font-semibold",
                  tone === "gain" ? "text-gain" : "text-loss"
                )}
              >
                {formatPercent(pct, { signed: true, decimals: 1 })}
              </div>
              <div className="hidden w-20 shrink-0 text-right tnum text-2xs text-ink-muted lg:block">
                {formatMoney(p.unrealizedFund, p.fund.currency, {
                  compact: true,
                  signed: true,
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
