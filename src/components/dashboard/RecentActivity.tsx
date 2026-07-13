import type { FundOSData } from "@/lib/types";
import { formatDate, formatMoney, formatPrice } from "@/lib/calc";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { CircleDot, FileSignature, LineChart, LogOut } from "lucide-react";

interface Activity {
  date: string;
  icon: React.ReactNode;
  title: string;
  detail: string;
}

export function RecentActivity({ data }: { data: FundOSData }) {
  const events: Activity[] = [];

  for (const m of data.valuationMarks) {
    const c = data.companies.find((x) => x.id === m.company_id);
    events.push({
      date: m.valuation_date,
      icon: <LineChart className="h-3.5 w-3.5" />,
      title: `${c?.brand_name ?? c?.legal_name ?? "Company"} marked`,
      detail: `${formatPrice(m.price_per_share_local, m.currency)} · ${m.approval_status}`,
    });
  }

  for (const r of data.realizations) {
    const c = data.companies.find((x) => x.id === r.company_id);
    events.push({
      date: r.realization_date,
      icon: <LogOut className="h-3.5 w-3.5" />,
      title: `${c?.brand_name ?? "Company"} — ${r.event_type.replace("_", " ")}`,
      detail: `${formatMoney(r.net_amount, r.currency, { compact: true })} net proceeds`,
    });
  }

  for (const ts of data.termSheets.filter((t) => t.status === "signed" && t.signed_at)) {
    events.push({
      date: ts.signed_at!.slice(0, 10),
      icon: <FileSignature className="h-3.5 w-3.5" />,
      title: `Term sheet signed`,
      detail: `${ts.round_name ?? ""} · ${formatMoney(ts.proposed_investment_fund, ts.currency, { compact: true })}`,
    });
  }

  const sorted = events
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 10);

  return (
    <Panel className="h-full">
      <PanelHeader title="Recent Activity" subtitle="Marks, exits and signings" />
      <div className="relative p-4">
        <div className="absolute bottom-4 left-[26px] top-4 w-px bg-line" />
        <div className="flex flex-col gap-3.5">
          {sorted.map((e, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-faint">
                {e.icon}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="text-[13px] font-medium text-ink">{e.title}</div>
                <div className="truncate text-2xs text-ink-muted">{e.detail}</div>
              </div>
              <span className="shrink-0 tnum text-2xs text-ink-faint">
                {formatDate(e.date, "medium")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
