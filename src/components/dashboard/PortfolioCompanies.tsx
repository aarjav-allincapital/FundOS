"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import type { FundOSData } from "@/lib/types";
import {
  allCompanyRollups,
  formatMoney,
  formatMultiple,
  formatDate,
  type CompanyRollup,
} from "@/lib/calc";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Delta } from "@/components/ui/Delta";
import { cn } from "@/lib/cn";

type SortKey = "name" | "fmv" | "moic" | "unrealized" | "mark";

export function PortfolioCompanies({ data }: { data: FundOSData }) {
  const rollups = useMemo(() => allCompanyRollups(data), [data]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("fmv");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rollups.filter(
      (r) =>
        !q ||
        r.company.legal_name.toLowerCase().includes(q) ||
        r.company.brand_name?.toLowerCase().includes(q) ||
        r.company.abbr?.toLowerCase().includes(q) ||
        r.company.sector?.toLowerCase().includes(q)
    );
    const sorted = [...filtered].sort((a, b) => {
      const av = sortValue(a, sort);
      const bv = sortValue(b, sort);
      if (typeof av === "string" && typeof bv === "string") {
        return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return dir === "asc"
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
    return sorted;
  }, [rollups, query, sort, dir]);

  function toggleSort(key: SortKey) {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir(key === "name" ? "asc" : "desc");
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="Portfolio Companies"
        subtitle={`${rows.length} of ${rollups.length} holdings · mark-to-market`}
        action={
          <div className="flex items-center gap-1.5 rounded border border-line bg-surface-subtle px-2 h-7">
            <Search className="h-3 w-3 text-ink-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter…"
              className="w-28 bg-transparent text-2xs text-ink outline-none placeholder:text-ink-faint"
            />
          </div>
        }
      />
      <Table>
        <THead>
          <SortableTH label="Company" active={sort === "name"} dir={dir} onClick={() => toggleSort("name")} />
          <TH>Sector</TH>
          <TH>Funds</TH>
          <TH num>Cost</TH>
          <SortableTH label="FMV" num active={sort === "fmv"} dir={dir} onClick={() => toggleSort("fmv")} />
          <SortableTH label="Unrealized" num active={sort === "unrealized"} dir={dir} onClick={() => toggleSort("unrealized")} />
          <SortableTH label="MOIC" num active={sort === "moic"} dir={dir} onClick={() => toggleSort("moic")} />
          <SortableTH label="Last Mark" num active={sort === "mark"} dir={dir} onClick={() => toggleSort("mark")} />
          <TH>Status</TH>
        </THead>
        <TBody>
          {rows.map((r) => {
            const ccy = r.funds[0]?.currency ?? "INR";
            const cost = r.costByCurrency[ccy] ?? 0;
            const fmv = r.fmvByCurrency[ccy] ?? 0;
            const unreal = r.unrealizedByCurrency[ccy] ?? 0;
            const unrealPct = cost > 0 ? (unreal / cost) * 100 : null;
            return (
              <TR key={r.company.id}>
                <TD strong>
                  <span>{r.company.brand_name ?? r.company.legal_name}</span>
                </TD>
                <TD muted>{r.company.sector ?? "—"}</TD>
                <TD muted>
                  <div className="flex gap-1">
                    {r.funds.map((f) => (
                      <Badge key={f.id} tone="outline">
                        {f.vehicle_code}
                      </Badge>
                    ))}
                  </div>
                </TD>
                <TD num muted>{formatMoney(cost, ccy, { compact: true })}</TD>
                <TD num strong>{formatMoney(fmv, ccy, { compact: true })}</TD>
                <TD num>
                  <div className="flex flex-col items-end">
                    <span className={cn("tnum", unreal > 0 ? "text-gain" : unreal < 0 ? "text-loss" : "text-ink-muted")}>
                      {formatMoney(unreal, ccy, { compact: true, signed: true })}
                    </span>
                    <Delta value={unrealPct} showIcon={false} className="text-2xs" />
                  </div>
                </TD>
                <TD num strong>{formatMultiple(r.blendedMoic)}</TD>
                <TD num muted>{formatDate(r.latestMarkDate, "medium")}</TD>
                <TD>
                  <Badge tone={statusTone(r.status)}>{r.status.replace("_", " ")}</Badge>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </Panel>
  );
}

function sortValue(r: CompanyRollup, key: SortKey): number | string {
  const ccy = r.funds[0]?.currency ?? "INR";
  switch (key) {
    case "name":
      return (r.company.brand_name ?? r.company.legal_name).toLowerCase();
    case "fmv":
      return r.fmvByCurrency[ccy] ?? 0;
    case "unrealized":
      return r.unrealizedByCurrency[ccy] ?? 0;
    case "moic":
      return r.blendedMoic;
    case "mark":
      return r.latestMarkDate ?? "";
  }
}

function SortableTH({
  label,
  active,
  dir,
  onClick,
  num = false,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  num?: boolean;
}) {
  return (
    <TH num={num}>
      <button
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-0.5 uppercase tracking-wide hover:text-ink",
          num && "flex-row-reverse",
          active ? "text-ink" : "text-ink-faint"
        )}
      >
        {label}
        {active &&
          (dir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          ))}
      </button>
    </TH>
  );
}
