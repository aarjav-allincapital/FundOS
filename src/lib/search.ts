import type { FundOSData } from "@/lib/types";
import type { SearchItem } from "@/components/layout/Topbar";

/** Build a flat, client-searchable index across the core record types. */
export function buildSearchIndex(data: FundOSData): SearchItem[] {
  const items: SearchItem[] = [];

  for (const f of data.funds) {
    items.push({
      id: `fund-${f.id}`,
      label: `${f.name} · ${f.code}`,
      sublabel: `${f.currency} fund · vintage ${f.vintage_year ?? "—"}`,
      kind: "Fund",
      href: "/funds",
    });
  }

  for (const c of data.companies) {
    items.push({
      id: `co-${c.id}`,
      label: c.brand_name ?? c.legal_name,
      sublabel: `${c.abbr ?? ""} · ${c.sector ?? ""}`,
      kind: "Company",
      href: "/companies",
    });
  }

  for (const l of data.investmentLots) {
    const c = data.companies.find((x) => x.id === l.company_id);
    items.push({
      id: `lot-${l.id}`,
      label: l.code,
      sublabel: `${c?.brand_name ?? c?.legal_name ?? ""} · ${l.vehicle}`,
      kind: "Lot",
      href: "/lots",
    });
  }

  for (const s of data.positionSnapshots) {
    items.push({
      id: `snap-${s.id}`,
      label: s.snapshot_code,
      sublabel: `Snapshot · ${s.snapshot_date}`,
      kind: "Snapshot",
      href: "/snapshots",
    });
  }

  for (const d of data.deals) {
    const c = data.companies.find((x) => x.id === d.company_id);
    items.push({
      id: `deal-${d.id}`,
      label: c?.brand_name ?? d.notes?.split(" — ")[0] ?? "Deal",
      sublabel: `${d.stage.replace(/_/g, " ")} · ${d.deal_lead ?? ""}`,
      kind: "Deal",
      href: "/pipeline",
    });
  }

  for (const f of data.founders) {
    const c = data.companies.find((x) => x.id === f.company_id);
    items.push({
      id: `founder-${f.id}`,
      label: f.name,
      sublabel: `${f.role ?? ""} · ${c?.brand_name ?? ""}`,
      kind: "Founder",
      href: "/founders",
    });
  }

  return items;
}
