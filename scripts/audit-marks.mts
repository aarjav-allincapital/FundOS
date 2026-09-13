/**
 * READ-ONLY audit of valuation marks / snapshots / lot math against prod data.
 * Recomputes every number and prints discrepancies. Writes nothing.
 *
 *   npx tsx scripts/audit-marks.mts            # audit all companies
 *   npx tsx scripts/audit-marks.mts super      # deep-dive companies matching "super"
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { readWriteFundOS } from "./lib/supabase-io";
import { resolveFxRate } from "@/lib/calc/fx";
import { markReprices } from "@/lib/data/valuation";
import type { FundOSData, InvestmentLot, PositionSnapshot, ValuationMark } from "@/lib/types";

// ---- env (same loader as read-state.mts) ----
const t = readFileSync(".env.local", "utf8");
for (const l of t.split(/\r?\n/)) {
  if (!l || l.startsWith("#") || !l.includes("=")) continue;
  const i = l.indexOf("=");
  const k = l.slice(0, i).trim();
  let v = l.slice(i + 1).replace(/\\r|\\n|\r|\n/g, "").trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  process.env[k] = v.replace(/\\r|\\n|\r|\n/g, "").trim();
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const focus = (process.argv[2] ?? "").toLowerCase();
const d: FundOSData = await readWriteFundOS.read(sb);

const fmt = (n: number | null | undefined, dp = 2) =>
  n == null || Number.isNaN(n) ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: dp });
const pct = (a: number, b: number) => (b === 0 ? Infinity : Math.abs(a - b) / Math.abs(b));

interface Issue { sev: "ERROR" | "WARN"; company: string; what: string }
const issues: Issue[] = [];
const flag = (sev: Issue["sev"], company: string, what: string) => issues.push({ sev, company, what });

console.log(`\nDATASET: ${d.companies.length} companies, ${d.investmentLots.length} lots, ${d.valuationMarks.length} marks, ${d.positionSnapshots.length} snapshots\n`);

for (const c of d.companies) {
  const name = c.brand_name ?? c.legal_name;
  const lots = d.investmentLots.filter((l) => l.company_id === c.id);
  const marks = d.valuationMarks
    .filter((m) => m.company_id === c.id)
    .sort((a, b) => a.valuation_date.localeCompare(b.valuation_date) || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  if (lots.length === 0 && marks.length === 0) continue;

  const deep = focus && name.toLowerCase().includes(focus);
  const repricing = marks.filter((m) => markReprices(m.valuation_type, m.mark_status ?? null));
  const latestRepricing = [...repricing].sort((a, b) => b.valuation_date.localeCompare(a.valuation_date))[0] ?? null;

  // ---- mark-level checks ----
  const seen = new Map<string, ValuationMark[]>();
  for (const m of marks) {
    const key = m.valuation_date;
    seen.set(key, [...(seen.get(key) ?? []), m]);
    // PPS vs post-money/shares coherence
    if (m.price_per_share_local > 0 && m.post_money_local && m.shares && m.shares > 0) {
      const implied = m.post_money_local / m.shares;
      if (pct(implied, m.price_per_share_local) > 0.02) {
        flag("ERROR", name, `mark ${m.valuation_date} (${m.valuation_type}/${m.mark_status ?? "-"}): post_money/shares = ${fmt(implied)} but PPS = ${fmt(m.price_per_share_local)} (${((implied / m.price_per_share_local - 1) * 100).toFixed(1)}% off)`);
      }
    }
    // Term sheet marks must not have snapshots
    const snapsForMark = d.positionSnapshots.filter((s) => s.valuation_mark_id === m.id);
    if (!markReprices(m.valuation_type, m.mark_status ?? null) && snapsForMark.length > 0) {
      flag("ERROR", name, `TERMSHEET mark ${m.valuation_date} has ${snapsForMark.length} snapshots — it repriced NAV but shouldn't`);
    }
    if (m.approval_status !== "approved" && snapsForMark.length > 0) {
      flag("WARN", name, `mark ${m.valuation_date} is ${m.approval_status} but has ${snapsForMark.length} snapshots (pending marks still move NAV)`);
    }
    if (m.price_per_share_local === 0 && markReprices(m.valuation_type, m.mark_status ?? null)) {
      flag("ERROR", name, `repricing mark ${m.valuation_date} (${m.valuation_type}/${m.mark_status ?? "-"}) has PPS = 0 — zeroes NAV`);
    }
  }
  for (const [date, ms] of seen) if (ms.length > 1) {
    flag("WARN", name, `${ms.length} marks on ${date} (${ms.map((m) => `${m.valuation_type}/${m.mark_status ?? "-"} pps=${fmt(m.price_per_share_local)}`).join(" | ")}) — duplicates?`);
  }

  // ---- company cache checks ----
  if (latestRepricing && c.latest_mark_price != null && pct(c.latest_mark_price, latestRepricing.price_per_share_local) > 0.001) {
    flag("ERROR", name, `company cache latest_mark_price=${fmt(c.latest_mark_price)} (${c.latest_mark_price_date}) but latest repricing mark is ${fmt(latestRepricing.price_per_share_local)} @ ${latestRepricing.valuation_date}`);
  }

  // ---- lot-level math ----
  for (const lot of lots) {
    const fund = d.funds.find((f) => f.id === lot.fund_id);
    if (!fund) { flag("ERROR", name, `lot ${lot.code}: fund missing`); continue; }
    const snaps = d.positionSnapshots
      .filter((s) => s.lot_id === lot.id)
      .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
    const latest = snaps[0];

    // entry math: cash ≈ shares × pps (only meaningful pre-exit; partial exits scale both)
    if (lot.shares_acquired != null && lot.shares_acquired > 0 && lot.price_per_share_local > 0) {
      const expCash = lot.shares_acquired * lot.price_per_share_local;
      if (pct(expCash, lot.cash_invested_local) > 0.02) {
        flag("ERROR", name, `lot ${lot.code}: shares×pps = ${fmt(expCash)} but cash_invested_local = ${fmt(lot.cash_invested_local)}`);
      }
    }
    // duplicate same-date snapshots
    const byDate = new Map<string, number>();
    for (const s of snaps) byDate.set(s.snapshot_date, (byDate.get(s.snapshot_date) ?? 0) + 1);
    for (const [sd, n] of byDate) if (n > 1) flag("WARN", name, `lot ${lot.code}: ${n} snapshots on ${sd}`);

    if ((lot.status === "active" || lot.status === "partial_exit") && latest) {
      // latest snapshot should reflect the latest repricing mark
      if (latestRepricing && latest.snapshot_date < latestRepricing.valuation_date) {
        flag("ERROR", name, `lot ${lot.code}: latest snapshot ${latest.snapshot_date} predates latest repricing mark ${latestRepricing.valuation_date} — fan-out gap`);
      }
      if (latestRepricing && latest.snapshot_date === latestRepricing.valuation_date &&
          pct(latest.mark_price_per_share_local, latestRepricing.price_per_share_local) > 0.001) {
        flag("ERROR", name, `lot ${lot.code}: snapshot@${latest.snapshot_date} priced ${fmt(latest.mark_price_per_share_local)} but mark says ${fmt(latestRepricing.price_per_share_local)}`);
      }
      // recompute snapshot internals
      const expFmvLocal = latest.as_converted_shares * latest.mark_price_per_share_local * (latest.mark_factor ?? 1);
      if (pct(expFmvLocal, latest.fmv_local) > 0.01) {
        flag("ERROR", name, `lot ${lot.code}: snapshot@${latest.snapshot_date} fmv_local=${fmt(latest.fmv_local)} ≠ shares×pps=${fmt(expFmvLocal)}`);
      }
      const expFmvFund = latest.fmv_local * latest.fx_rate_at_mark;
      if (pct(expFmvFund, latest.fmv_fund) > 0.01) {
        flag("ERROR", name, `lot ${lot.code}: snapshot@${latest.snapshot_date} fmv_fund=${fmt(latest.fmv_fund)} ≠ fmv_local×fx=${fmt(expFmvFund)}`);
      }
      // share drift: snapshot shares vs lot shares
      if (lot.shares_acquired != null && latest.as_converted_shares !== lot.shares_acquired) {
        flag("WARN", name, `lot ${lot.code}: snapshot@${latest.snapshot_date} uses ${fmt(latest.as_converted_shares, 4)} shares but lot holds ${fmt(lot.shares_acquired, 4)}`);
      }
      // cost basis consistency
      if (pct(latest.cost_basis_fund, lot.cash_invested_fund) > 0.01) {
        flag("ERROR", name, `lot ${lot.code}: snapshot cost_basis_fund=${fmt(latest.cost_basis_fund)} but lot cash_invested_fund=${fmt(lot.cash_invested_fund)}`);
      }
      // FX sanity vs our own fx table
      const expFx = resolveFxRate(d.fxRates, c.operating_currency, fund.currency, latest.snapshot_date, { purposes: ["reporting", "manual"] });
      if (c.operating_currency !== fund.currency && Number.isFinite(expFx.rate) && pct(expFx.rate, latest.fx_rate_at_mark) > 0.15) {
        flag("WARN", name, `lot ${lot.code}: snapshot fx=${latest.fx_rate_at_mark} vs table rate ${expFx.rate.toFixed(6)} (${expFx.rate_date}) — >15% apart`);
      }
      const moic = latest.cost_basis_fund > 0 ? latest.fmv_fund / latest.cost_basis_fund : 0;
      if (pct(moic, latest.moic_at_snapshot || moic) > 0.01) {
        flag("ERROR", name, `lot ${lot.code}: stored MOIC ${latest.moic_at_snapshot} ≠ recomputed ${moic.toFixed(4)}`);
      }
      if (moic > 25 || (moic > 0 && moic < 0.02)) {
        flag("WARN", name, `lot ${lot.code}: extreme MOIC ${moic.toFixed(2)}x (fmv_fund=${fmt(latest.fmv_fund)}, cost=${fmt(latest.cost_basis_fund)}) — check price/share unit`);
      }
    }
    // orphan snapshots pointing at deleted marks
    for (const s of snaps) {
      if (s.valuation_mark_id && !d.valuationMarks.some((m) => m.id === s.valuation_mark_id)) {
        flag("WARN", name, `lot ${lot.code}: snapshot@${s.snapshot_date} references deleted mark ${s.valuation_mark_id}`);
      }
    }
  }

  // ---- deep dive print ----
  if (deep) {
    console.log(`\n========== DEEP DIVE: ${name} (${c.id}) [${c.operating_currency}] status=${c.status} ==========`);
    console.log(`cache: latest_mark_price=${fmt(c.latest_mark_price)} @ ${c.latest_mark_price_date} | last_approved_pps=${fmt(c.last_approved_price_per_share)} | last_post_money=${fmt(c.last_approved_post_money_local)}`);
    console.log(`\nMARKS (${marks.length}):`);
    for (const m of marks) {
      const snapsN = d.positionSnapshots.filter((s) => s.valuation_mark_id === m.id).length;
      console.log(`  ${m.valuation_date}  ${m.valuation_type}/${m.mark_status ?? "-"}  pps=${fmt(m.price_per_share_local)}  shares=${fmt(m.shares, 0)}  pre=${fmt(m.pre_money_local, 0)}  post=${fmt(m.post_money_local, 0)}  approval=${m.approval_status}  src=${m.source}  snaps=${snapsN}  id=${m.id}`);
    }
    for (const lot of lots) {
      const fund = d.funds.find((f) => f.id === lot.fund_id)!;
      console.log(`\nLOT ${lot.code} [${lot.status}] fund=${fund.code}(${fund.currency}) vehicle=${lot.vehicle}`);
      console.log(`  entry: ${lot.investment_date}  shares=${fmt(lot.shares_acquired, 4)}  pps=${fmt(lot.price_per_share_local)}  cash_local=${fmt(lot.cash_invested_local)}  cash_fund=${fmt(lot.cash_invested_fund)}  paid_in=${fmt(lot.paid_in_capital_fund)}  fx=${lot.fx_rate_at_entry}`);
      const snaps = d.positionSnapshots.filter((s) => s.lot_id === lot.id).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
      for (const s of snaps) {
        const expL = s.as_converted_shares * s.mark_price_per_share_local * (s.mark_factor ?? 1);
        const expF = expL * s.fx_rate_at_mark;
        const ok = pct(expL, s.fmv_local) <= 0.01 && pct(expF, s.fmv_fund) <= 0.01 ? "✓" : "✗";
        console.log(`  snap ${s.snapshot_date}: shares=${fmt(s.as_converted_shares, 4)} × pps=${fmt(s.mark_price_per_share_local)} × factor=${s.mark_factor ?? 1} = ${fmt(expL)} local (stored ${fmt(s.fmv_local)}) × fx=${s.fx_rate_at_mark} = ${fmt(expF)} fund (stored ${fmt(s.fmv_fund)}) cost=${fmt(s.cost_basis_fund)} moic=${s.moic_at_snapshot} ${ok} ${s.notes ? `[${s.notes}]` : ""} mark=${s.valuation_mark_id ?? "-"}`);
      }
      const reals = d.realizations.filter((r) => r.lot_id === lot.id);
      for (const r of reals) console.log(`  exit ${r.realization_date}: ${r.event_type} shares_sold=${fmt(r.shares_sold, 4)} pps=${fmt(r.price_per_share)} gross=${fmt(r.gross_amount)} fx=${r.fx_rate}`);
    }
  }
}

// ---- summary ----
console.log(`\n\n================ ISSUES (${issues.length}) ================`);
const errs = issues.filter((i) => i.sev === "ERROR");
const warns = issues.filter((i) => i.sev === "WARN");
for (const i of errs) console.log(`  ERROR [${i.company}] ${i.what}`);
for (const i of warns) console.log(`  WARN  [${i.company}] ${i.what}`);
console.log(`\n${errs.length} errors, ${warns.length} warnings.`);
