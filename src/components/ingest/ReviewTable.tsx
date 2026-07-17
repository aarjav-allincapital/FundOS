"use client";

import { Trash2 } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { inputClass } from "@/components/forms/form-ui";
import { formatMoney } from "@/lib/calc";
import type { DraftRecord, DraftKind } from "@/lib/ingest/types";
import type {
  ExtractedCompany,
  ExtractedFounder,
  ExtractedLot,
  ExtractedMark,
} from "@/lib/ingest/types";

interface FieldSpec {
  key: string;
  label: string;
  type?: "text" | "number";
  width?: string;
}

const FIELDS: Record<DraftKind, FieldSpec[]> = {
  company: [
    { key: "legal_name", label: "Legal name", width: "flex-[2]" },
    { key: "operating_currency", label: "Ccy", width: "w-20" },
    { key: "sector", label: "Sector", width: "flex-1" },
    { key: "hq_country", label: "Country", width: "w-24" },
  ],
  founder: [
    { key: "name", label: "Name", width: "flex-1" },
    { key: "company_name", label: "Company", width: "flex-1" },
    { key: "role", label: "Role", width: "flex-1" },
  ],
  lot: [
    { key: "investor_name", label: "Investor", width: "flex-[2]" },
    { key: "company_name", label: "Company", width: "flex-1" },
    { key: "round_name", label: "Round", width: "w-24" },
    { key: "investment_date", label: "Date", width: "w-28" },
    { key: "shares_acquired", label: "Shares", type: "number", width: "w-24" },
    { key: "price_per_share_local", label: "Price", type: "number", width: "w-20" },
    { key: "currency", label: "Ccy", width: "w-14" },
  ],
  mark: [
    { key: "company_name", label: "Company", width: "flex-[2]" },
    { key: "valuation_date", label: "Date", width: "w-28" },
    { key: "price_per_share_local", label: "Price", type: "number", width: "w-24" },
  ],
};

const KIND_LABEL: Record<DraftKind, string> = {
  company: "Companies",
  founder: "Founders",
  lot: "Investment Lots",
  mark: "Valuation Marks",
};

const KIND_ORDER: DraftKind[] = ["company", "founder", "lot", "mark"];

type AnyEntity = ExtractedCompany & ExtractedFounder & ExtractedLot & ExtractedMark;

export function ReviewTable({
  drafts,
  onToggle,
  onEdit,
  onRemove,
  onCommit,
  onClear,
  committing,
}: {
  drafts: DraftRecord[];
  onToggle: (id: string, include: boolean) => void;
  onEdit: (id: string, patch: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
  onCommit: () => void;
  onClear: () => void;
  committing: boolean;
}) {
  if (drafts.length === 0) return null;
  const includedCount = drafts.filter((d) => d.include).length;

  return (
    <Panel>
      <PanelHeader
        title="Review drafts"
        subtitle="Edit anything, untick to skip. Nothing is saved until you commit."
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClear}
              disabled={committing}
              className="rounded border border-line px-2.5 py-1.5 text-2xs font-medium text-ink-muted transition-colors hover:bg-surface-subtle disabled:opacity-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onCommit}
              disabled={committing || includedCount === 0}
              className="rounded bg-ink px-3 py-1.5 text-2xs font-semibold text-surface hover:bg-ink/90 disabled:opacity-50"
            >
              {committing ? "Committing…" : `Commit ${includedCount} record${includedCount === 1 ? "" : "s"}`}
            </button>
          </div>
        }
      />
      <div className="flex flex-col gap-4 p-4">
        {KIND_ORDER.map((kind) => {
          const group = drafts.filter((d) => d.kind === kind);
          if (group.length === 0) return null;
          return (
            <div key={kind}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-2xs font-semibold uppercase tracking-wide text-ink-faint">
                  {KIND_LABEL[kind]}
                </span>
                <Badge tone="neutral">{group.length}</Badge>
              </div>
              <div className="flex flex-col gap-1.5">
                {group.map((d) => {
                  const data = d.data as AnyEntity;
                  return (
                    <div
                      key={d.id}
                      className="flex flex-wrap items-end gap-2 rounded border border-line bg-surface p-2"
                    >
                      <input
                        type="checkbox"
                        checked={d.include}
                        onChange={(e) => onToggle(d.id, e.target.checked)}
                        className="mb-1.5"
                        title="Include in commit"
                      />
                      {FIELDS[kind].map((field) => (
                        <label key={field.key} className={`flex flex-col gap-0.5 ${field.width ?? "flex-1"}`}>
                          <span className="text-[10px] uppercase tracking-wide text-ink-faint">
                            {field.label}
                          </span>
                          <input
                            className={`${inputClass} py-1 text-[12px]`}
                            value={(data[field.key as keyof AnyEntity] as string | number | null) ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              onEdit(d.id, {
                                [field.key]: field.type === "number" ? (v === "" ? null : Number(v)) : v,
                              });
                            }}
                          />
                        </label>
                      ))}
                      {kind === "lot" && (() => {
                        const total =
                          data.cash_invested_local ??
                          (data.shares_acquired ?? 0) * (data.price_per_share_local ?? 0);
                        return (
                          <div className="flex w-24 flex-col gap-0.5">
                            <span className="text-[10px] uppercase tracking-wide text-ink-faint">Total</span>
                            <span className="tnum rounded bg-surface-subtle px-2 py-1 text-[12px] font-semibold text-ink">
                              {formatMoney(total, data.currency ?? "INR", { compact: true })}
                            </span>
                          </div>
                        );
                      })()}
                      {d.existing && (
                        <span
                          className="mb-0.5 rounded bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-muted"
                          title="A matching record already exists in FundOS — unticked so it isn't duplicated"
                        >
                          in FundOS
                        </span>
                      )}
                      <span
                        className="mb-0.5 text-[10px] text-ink-faint"
                        title={`${d.provenance.method} · ${d.provenance.source}`}
                      >
                        {d.provenance.method === "extraction" ? "AI" : "CSV"}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemove(d.id)}
                        className="mb-1 text-ink-faint hover:text-loss"
                        title="Discard"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
