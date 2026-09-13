"use client";

import type { FundOSData } from "@/lib/types";
import { companyRollup, formatMoney, formatMultiple } from "@/lib/calc";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Badge, statusTone } from "@/components/ui/Badge";
import { RecordActions } from "@/components/forms/RecordActions";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { companyOpenRound } from "@/lib/data/valuation";
import { ExternalLink, Lightbulb, MapPin } from "lucide-react";

function websiteHost(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(
      /^www\./i,
      "",
    );
  } catch {
    return url;
  }
}

export function CompanyDirectory({ data }: { data: FundOSData }) {
  const cards = data.companies
    .map((c) => companyRollup(data, c))
    .sort((a, b) =>
      (a.company.brand_name ?? a.company.legal_name).localeCompare(
        b.company.brand_name ?? b.company.legal_name,
      ),
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
            const name = r.company.brand_name ?? r.company.legal_name;
            const website = r.company.website?.trim() || null;
            const openRound = companyOpenRound(data, r.company.id);

            // Realized state is derived from the lots, not company.status — a
            // company with any written-off/exited lot is flagged (write-offs in
            // red since they're a pure loss).
            const lots = data.investmentLots.filter(
              (l) => l.company_id === r.company.id,
            );
            const hasWriteOff = lots.some((l) => l.status === "written_off");
            const hasFullExit = lots.some((l) => l.status === "full_exit");
            const hasPartialExit = lots.some((l) => l.status === "partial_exit");

            return (
              <div
                key={r.company.id}
                className={
                  hasWriteOff
                    ? "flex flex-col gap-3 bg-loss/[0.04] p-4 ring-1 ring-inset ring-loss/40"
                    : hasFullExit
                      ? "flex flex-col gap-3 bg-surface p-4 ring-1 ring-inset ring-loss/25"
                      : "flex flex-col gap-3 bg-surface p-4"
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-3">
                    <CompanyLogo company={r.company} size={44} className="rounded-md border border-line" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-[13px] font-semibold leading-tight text-ink">
                        <span className={hasWriteOff ? "truncate text-loss" : "truncate"}>{name}</span>
                        {openRound && (
                          <span
                            className="inline-flex shrink-0 items-center text-amber-500"
                            title={`Round open — term sheet out @ ${openRound.valuation_date} (not yet in NAV)`}
                          >
                            <span aria-hidden>*</span>
                            <Lightbulb className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                      {r.company.brand_name && r.company.brand_name !== r.company.legal_name && (
                        <div className="truncate text-2xs text-ink-faint">{r.company.legal_name}</div>
                      )}
                      <div className="mt-0.5 text-2xs text-ink-muted">
                        {r.company.sector ?? "—"}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {hasWriteOff ? (
                      <Badge tone="loss">Written off</Badge>
                    ) : hasFullExit ? (
                      <Badge tone="loss">Exited</Badge>
                    ) : hasPartialExit ? (
                      <Badge tone="warn">Partial exit</Badge>
                    ) : (
                      <Badge tone={statusTone(r.status)}>{r.status.replace("_", " ")}</Badge>
                    )}
                    <RecordActions mode="company" recordId={r.company.id} />
                  </div>
                </div>

                <div className="flex flex-col gap-1 text-2xs text-ink-muted">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0 text-ink-faint" />
                    <span className="truncate">
                      {[r.company.hq_city, r.company.hq_country].filter(Boolean).join(", ") || "—"}
                    </span>
                  </div>
                  {website && (
                    <a
                      href={website.startsWith("http") ? website : `https://${website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 truncate text-ink-muted transition-colors hover:text-ink"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0 text-ink-faint" />
                      <span className="truncate">{websiteHost(website)}</span>
                    </a>
                  )}
                </div>

                <div className="mt-auto grid grid-cols-2 gap-2 border-t border-line pt-3">
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
