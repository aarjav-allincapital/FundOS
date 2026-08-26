"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Search } from "lucide-react";
import type { Company, Fund, FundOSData } from "@/lib/types";
import {
  allLotPositions,
  formatMoney,
  formatMultiple,
  formatNumber,
  formatDate,
  humanize,
  type LotPosition,
} from "@/lib/calc";
import { useFundOS } from "@/providers/FundOSProvider";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { Badge, statusTone } from "@/components/ui/Badge";
import { RecordActions } from "@/components/forms/RecordActions";
import { Delta } from "@/components/ui/Delta";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { cn } from "@/lib/cn";

type SortKey = "name" | "cost" | "fmv" | "moic" | "unrealized" | "invested" | "mark";

/** A company entity with its investment lots collapsed underneath it. */
interface CompanyGroup {
  company: Company;
  funds: Fund[];
  lots: LotPosition[];
  /** Display currency for the aggregate (primary fund's currency). */
  currency: string;
  cost: number;
  fmv: number;
  unrealized: number;
  unrealizedPct: number | null;
  moic: number;
  firstInvestedDate: string | null;
  latestMarkDate: string | null;
  status: string;
}

/** Aggregate a company's lots into a single entity row (primary-currency totals). */
function buildGroup(company: Company, lots: LotPosition[]): CompanyGroup {
  const funds = uniqueBy(
    lots.map((l) => l.fund),
    (f) => f.id,
  );
  const currency = funds[0]?.currency ?? "INR";
  // Sum only lots sharing the primary currency — never add across currencies.
  const inCcy = lots.filter((l) => l.fund.currency === currency);
  const cost = inCcy.reduce((s, l) => s + l.costBasisFund, 0);
  const fmv = inCcy.reduce((s, l) => s + l.fmvFund, 0);
  const unrealized = inCcy.reduce((s, l) => s + l.unrealizedFund, 0);
  const moic = cost > 0 ? fmv / cost : 0;
  const unrealizedPct = cost > 0 ? (unrealized / cost) * 100 : null;
  const firstInvestedDate =
    lots.map((l) => l.lot.investment_date).filter(Boolean).sort()[0] ?? null;
  const latestMarkDate =
    lots
      .map((l) => l.latest?.snapshot_date)
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? null;

  return {
    company,
    funds,
    lots,
    currency,
    cost,
    fmv,
    unrealized,
    unrealizedPct,
    moic,
    firstInvestedDate,
    latestMarkDate,
    status: company.status,
  };
}

export function InvestmentLots({ data }: { data: FundOSData }) {
  const { mergeLots } = useFundOS();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [fundFilter, setFundFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("fmv");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const positions = useMemo(() => allLotPositions(data), [data]);

  // Group every lot under its company entity.
  const groups = useMemo(() => {
    const byCompany = new Map<string, LotPosition[]>();
    for (const p of positions) {
      const arr = byCompany.get(p.company.id);
      if (arr) arr.push(p);
      else byCompany.set(p.company.id, [p]);
    }
    const out: CompanyGroup[] = [];
    for (const [, lots] of byCompany) {
      const sortedLots = [...lots].sort((a, b) =>
        (b.lot.investment_date || "").localeCompare(a.lot.investment_date || ""),
      );
      out.push(buildGroup(sortedLots[0].company, sortedLots));
    }
    return out;
  }, [positions]);

  const q = query.trim().toLowerCase();
  const lotFiltersActive = q !== "" || statusFilter !== "all" || fundFilter !== "all";

  // Filter at the lot level, then keep only companies that still hold a lot.
  const rows = useMemo(() => {
    const matchCompany = (c: Company) =>
      !q ||
      c.legal_name.toLowerCase().includes(q) ||
      (c.brand_name?.toLowerCase().includes(q) ?? false) ||
      (c.abbr?.toLowerCase().includes(q) ?? false) ||
      (c.sector?.toLowerCase().includes(q) ?? false);

    const matchLot = (p: LotPosition, companyMatches: boolean) => {
      if (statusFilter !== "all" && p.lot.status !== statusFilter) return false;
      if (fundFilter !== "all" && p.fund.id !== fundFilter) return false;
      if (q) {
        return (
          companyMatches ||
          p.lot.code.toLowerCase().includes(q) ||
          (p.round?.round_name?.toLowerCase().includes(q) ?? false) ||
          p.lot.vehicle.toLowerCase().includes(q)
        );
      }
      return true;
    };

    const filtered: CompanyGroup[] = [];
    for (const g of groups) {
      const companyMatches = matchCompany(g.company);
      const lots = g.lots.filter((p) => matchLot(p, companyMatches));
      if (lots.length === 0) continue;
      // Recompute aggregates from the visible lots so totals match what's shown.
      filtered.push(buildGroup(g.company, lots));
    }

    const sorted = filtered.sort((a, b) => {
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
  }, [groups, q, statusFilter, fundFilter, sort, dir]);

  const totalLots = rows.reduce((s, g) => s + g.lots.length, 0);
  const allExpanded = rows.length > 0 && rows.every((g) => isOpen(g.company.id));

  function isOpen(companyId: string): boolean {
    // Any active lot-level filter reveals matching sublots automatically.
    return lotFiltersActive || expanded.has(companyId);
  }

  function toggleExpand(companyId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  }

  function toggleAll() {
    if (allExpanded) setExpanded(new Set());
    else setExpanded(new Set(rows.map((g) => g.company.id)));
  }

  function toggleSort(key: SortKey) {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir(key === "name" ? "asc" : "desc");
    }
  }

  const chosen = positions.filter((p) => selected.has(p.lot.id));
  const mergeable =
    chosen.length >= 2 &&
    chosen.every(
      (p) =>
        p.company.id === chosen[0].company.id &&
        p.fund.id === chosen[0].fund.id &&
        p.lot.currency === chosen[0].lot.currency,
    );
  const mismatch = chosen.length >= 2 && !mergeable;

  function toggleSelect(id: string) {
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
        subtitle={`${rows.length} ${rows.length === 1 ? "company" : "companies"} · ${totalLots} ${totalLots === 1 ? "lot" : "lots"}`}
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded border border-line bg-surface-subtle px-2 h-7">
              <Search className="h-3 w-3 text-ink-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter company, lot, round…"
                className="w-40 bg-transparent text-2xs text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
            <select
              value={fundFilter}
              onChange={(e) => setFundFilter(e.target.value)}
              className="h-7 rounded border border-line bg-surface-subtle px-2 text-2xs text-ink outline-none"
            >
              <option value="all">All funds</option>
              {data.funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.vehicle_code}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-7 rounded border border-line bg-surface-subtle px-2 text-2xs text-ink outline-none"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="partial_exit">Partial exit</option>
              <option value="full_exit">Full exit</option>
              <option value="written_off">Written off</option>
            </select>
            <button
              type="button"
              onClick={toggleAll}
              className="rounded border border-line px-2.5 h-7 text-2xs font-medium text-ink-muted hover:bg-surface-subtle"
            >
              {allExpanded ? "Collapse all" : "Expand all"}
            </button>
          </div>
        }
      />

      {selected.size > 0 && (
        <div className="flex items-center justify-end gap-2 border-b border-line bg-surface-subtle/50 px-3 py-2">
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
      )}

      <Table>
        <THead>
          <TH className="w-8" />
          <SortableTH label="Company / Lot" active={sort === "name"} dir={dir} onClick={() => toggleSort("name")} />
          <TH>Round</TH>
          <TH>Instrument</TH>
          <TH num>Shares</TH>
          <SortableTH label="Cost" num active={sort === "cost"} dir={dir} onClick={() => toggleSort("cost")} />
          <SortableTH label="FMV" num active={sort === "fmv"} dir={dir} onClick={() => toggleSort("fmv")} />
          <SortableTH label="MOIC" num active={sort === "moic"} dir={dir} onClick={() => toggleSort("moic")} />
          <SortableTH label="Mark Δ" num active={sort === "unrealized"} dir={dir} onClick={() => toggleSort("unrealized")} />
          <TH>Status</TH>
          <TH className="w-20" />
        </THead>
        <TBody>
          {rows.map((g) => {
            const open = isOpen(g.company.id);
            return (
              <FragmentRows
                key={g.company.id}
                group={g}
                open={open}
                onToggle={() => toggleExpand(g.company.id)}
                selected={selected}
                onSelect={toggleSelect}
              />
            );
          })}
          {rows.length === 0 && (
            <TR>
              <TD className="text-center text-2xs text-ink-faint" >
                <span className="block px-3 py-6">No lots match these filters.</span>
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
    </Panel>
  );
}

function FragmentRows({
  group,
  open,
  onToggle,
  selected,
  onSelect,
}: {
  group: CompanyGroup;
  open: boolean;
  onToggle: () => void;
  selected: Set<string>;
  onSelect: (id: string) => void;
}) {
  const g = group;
  return (
    <>
      {/* Company entity row */}
      <TR
        onClick={onToggle}
        className={cn(
          open ? "bg-ink/[0.06] hover:bg-ink/[0.10]" : "hover:bg-surface-subtle",
        )}
      >
        <TD>
          <button
            type="button"
            aria-label={open ? "Collapse" : "Expand"}
            className="flex h-5 w-5 items-center justify-center rounded text-ink-muted hover:text-ink"
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        </TD>
        <TD strong>
          <div className="flex items-center gap-2">
            <CompanyLogo company={g.company} size={22} />
            <div className="min-w-0">
              <div className="truncate">
                {g.company.brand_name ?? g.company.legal_name}
              </div>
              <div className="text-[10px] font-normal text-ink-faint">
                {g.lots.length} {g.lots.length === 1 ? "lot" : "lots"}
                {g.company.sector ? ` · ${g.company.sector}` : ""}
              </div>
            </div>
          </div>
        </TD>
        <TD muted>
          {g.firstInvestedDate ? formatDate(g.firstInvestedDate, "medium") : "—"}
        </TD>
        <TD>
          <div className="flex gap-1">
            {g.funds.map((f) => (
              <Badge key={f.id} tone="outline">
                {f.vehicle_code}
              </Badge>
            ))}
          </div>
        </TD>
        <TD num muted>—</TD>
        <TD num muted>{formatMoney(g.cost, g.currency, { compact: true })}</TD>
        <TD num strong>{formatMoney(g.fmv, g.currency, { compact: true })}</TD>
        <TD num strong>{formatMultiple(g.moic)}</TD>
        <TD num>
          <Delta value={g.unrealizedPct} showIcon={false} />
        </TD>
        <TD>
          <Badge tone={statusTone(g.status)}>{g.status.replace("_", " ")}</Badge>
        </TD>
        <TD />
      </TR>

      {/* Sublots */}
      {open &&
        g.lots.map((p) => (
          <TR key={p.lot.id} className="bg-surface">
            <TD>
              <input
                type="checkbox"
                checked={selected.has(p.lot.id)}
                onChange={() => onSelect(p.lot.id)}
                onClick={(e) => e.stopPropagation()}
                title="Select to merge"
              />
            </TD>
            <TD className="pl-8">
              <div className="flex flex-col">
                <span className="font-mono text-2xs font-semibold text-ink">
                  {p.lot.code}
                </span>
                <span className="text-[10px] text-ink-faint tnum">
                  {formatDate(p.lot.investment_date, "medium")}
                  {p.latest?.snapshot_date &&
                    p.latest.snapshot_date !== p.lot.investment_date &&
                    ` · Mark ${formatDate(p.latest.snapshot_date, "short")}`}
                </span>
              </div>
            </TD>
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
    </>
  );
}

function sortValue(g: CompanyGroup, key: SortKey): number | string {
  switch (key) {
    case "name":
      return (g.company.brand_name ?? g.company.legal_name).toLowerCase();
    case "cost":
      return g.cost;
    case "fmv":
      return g.fmv;
    case "moic":
      return g.moic;
    case "unrealized":
      return g.unrealizedPct ?? 0;
    case "invested":
      return g.firstInvestedDate ?? "";
    case "mark":
      return g.latestMarkDate ?? "";
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
          active ? "text-ink" : "text-ink-faint",
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

function uniqueBy<T>(arr: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}
