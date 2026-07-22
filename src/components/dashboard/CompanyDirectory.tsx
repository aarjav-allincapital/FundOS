"use client";

import type { FundOSData } from "@/lib/types";
import { companyRollup, formatMoney, formatMultiple } from "@/lib/calc";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Badge, statusTone } from "@/components/ui/Badge";
import { RecordActions } from "@/components/forms/RecordActions";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { MapPin } from "lucide-react";
export function CompanyDirectory({ data }: { data: FundOSData }) {
  const cards = data.companies
    .map((c) => companyRollup(data, c))
    .sort((a, b) =>
      (a.company.brand_name ?? a.company.legal_name).localeCompare(
        b.company.brand_name ?? b.company.legal_name
      )
    );

  return (
    <Panel>
      <PanelHeader
        title="Company Directory"
        subtitle={`${cards.length} companies`}
      />
      {cards.length === 0 ? (
        <p className="p-8 text-center text-2xs text-ink-faint">
          No companies yet. Use + Add Company to create your first record.
        </p>
      ) : (
      <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((r) => {
          const ccy = r.funds[0]?.currency ?? "INR";
          return (
            <div key={r.company.id} className="flex flex-col gap-2 bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CompanyLogo company={r.company} size={28} />
                  <div>
                    <div className="text-[13px] font-semibold leading-tight text-ink">
                      {r.company.brand_name ?? r.company.legal_name}
                    </div>
                    <div className="text-2xs text-ink-faint">{r.company.sector}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge tone={statusTone(r.status)}>
                    {r.status.replace("_", " ")}
                  </Badge>
                  <RecordActions mode="company" recordId={r.company.id} />
                </div>
              </div>

              <div className="flex items-center gap-1 text-2xs text-ink-muted">
                <MapPin className="h-3 w-3 text-ink-faint" />
                {r.company.hq_city}, {r.company.hq_country}
              </div>

              <div className="mt-1 grid grid-cols-2 gap-2 border-t border-line pt-2">
                <div>
                  <div className="text-2xs text-ink-faint">NAV</div>
                  <div className="tnum text-[13px] font-semibold text-ink">
                    {formatMoney(r.fmvByCurrency[ccy] ?? 0, ccy, { compact: true })}
                  </div>
                </div>
                <div>
                  <div className="text-2xs text-ink-faint">MOIC</div>
                  <div className="tnum text-[13px] font-semibold text-ink">
                    {formatMultiple(r.blendedMoic)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </Panel>
  );
}
