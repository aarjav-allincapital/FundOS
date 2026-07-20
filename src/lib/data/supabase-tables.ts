import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FundOSData } from "@/lib/types";
import { createBootstrapData } from "@/lib/data/bootstrap";

/**
 * Relational persistence for FundOS. Each entity in FundOSData maps 1:1 to a
 * Postgres table (see migration 007). Reads select every table; writes perform
 * an atomic full-replace (delete-all → insert) per table. Column names match
 * the TypeScript field names exactly, so rows round-trip without remapping.
 */

type FundOSKey = keyof FundOSData;

interface TableSpec {
  table: string;
  key: FundOSKey;
  /** Whitelisted columns (also the field names on the object). */
  columns: string[];
}

// Insert order = parents first. Delete runs in reverse.
const TABLES: TableSpec[] = [
  {
    table: "fund_brands",
    key: "fundBrands",
    columns: ["id", "abbr", "name", "created_at"],
  },
  {
    table: "funds",
    key: "funds",
    columns: [
      "id", "fund_brand_id", "vehicle_code", "code", "name", "currency",
      "vintage_year", "status", "committed_capital_fund", "mgmt_fee_pct",
      "mgmt_fee_basis", "carry_pct", "hurdle_pct", "waterfall_style",
      "catch_up", "created_at",
    ],
  },
  {
    table: "companies",
    key: "companies",
    columns: [
      "id", "fund_brand_id", "abbr", "legal_name", "brand_name", "sector",
      "hq_country", "hq_city", "website", "logo_url", "operating_currency", "status",
      "latest_mark_price", "latest_mark_price_date", "last_priced_round_date",
      "last_approved_post_money_local", "last_approved_price_per_share",
      "created_at", "updated_at",
    ],
  },
  {
    table: "founders",
    key: "founders",
    columns: [
      "id", "company_id", "name", "role", "background", "email", "phone",
      "linkedin_url", "is_primary", "created_at",
    ],
  },
  {
    table: "deals",
    key: "deals",
    columns: [
      "id", "fund_id", "company_id", "stage", "source", "deal_owner_id",
      "deal_owner", "deal_lead", "deal_lead_id", "expected_investment",
      "committed_amount", "wired_amount", "currency", "expected_close_date",
      "actual_close_date", "is_first_investment", "notes", "created_at",
      "updated_at",
    ],
  },
  {
    table: "deal_stage_history",
    key: "dealStageHistory",
    columns: [
      "id", "deal_id", "from_stage", "to_stage", "changed_by", "changed_at",
      "notes",
    ],
  },
  {
    table: "rounds",
    key: "rounds",
    columns: [
      "id", "company_id", "deal_id", "round_name", "round_date", "our_role",
      "status", "price_per_share", "currency", "pre_money_local",
      "post_money_local", "pre_money_fund", "post_money_fund", "fx_rate",
      "old_total_shares", "new_shares_issued", "new_total_shares",
      "thesis_summary", "created_at",
    ],
  },
  {
    table: "round_investors",
    key: "roundInvestors",
    columns: ["id", "round_id", "name", "is_lead", "amount_local", "currency"],
  },
  {
    table: "term_sheets",
    key: "termSheets",
    columns: [
      "id", "deal_id", "round_id", "side", "status", "vehicle",
      "proposed_investment_local", "currency", "tentative_fx_rate",
      "proposed_investment_fund", "indicated_valuation_local", "is_post_money",
      "implied_price_per_share", "rights_and_terms", "round_name",
      "moic_at_entry", "signed_at", "investment_lot_id", "created_at",
    ],
  },
  {
    table: "investment_lots",
    key: "investmentLots",
    columns: [
      "id", "fund_id", "company_id", "round_id", "deal_id", "term_sheet_id",
      "lot_sequence", "code", "investment_date", "transaction_type", "vehicle",
      "shares_acquired", "price_per_share_local", "currency",
      "cash_invested_local", "cash_invested_fund", "paid_in_capital_fund",
      "fx_rate_at_entry", "ownership_at_entry_pct", "rights_and_terms",
      "moic_on_prior_lot", "overwrote_term_sheet", "status", "created_at",
      "updated_at",
    ],
  },
  {
    table: "valuation_marks",
    key: "valuationMarks",
    columns: [
      "id", "company_id", "valuation_date", "valuation_type",
      "price_per_share_local", "currency", "pre_money_local",
      "post_money_local", "source", "approval_status", "approved_by", "notes",
      "event_code", "created_at",
    ],
  },
  {
    table: "position_snapshots",
    key: "positionSnapshots",
    columns: [
      "id", "lot_id", "valuation_mark_id", "snapshot_code", "snapshot_date",
      "as_converted_shares", "ownership_pct_at_event",
      "mark_price_per_share_local", "currency", "fx_rate_at_mark",
      "mark_factor", "fmv_local", "fmv_fund", "cost_basis_fund",
      "unrealized_gain_loss_fund", "moic_at_snapshot", "notes", "created_at",
    ],
  },
  {
    table: "fx_rates",
    key: "fxRates",
    columns: [
      "id", "from_currency", "to_currency", "rate", "rate_date", "source",
      "purpose",
    ],
  },
  {
    table: "realizations",
    key: "realizations",
    columns: [
      "id", "lot_id", "company_id", "realization_date", "event_type",
      "shares_sold", "price_per_share", "gross_amount", "net_amount",
      "currency", "fx_rate", "notes", "created_at",
    ],
  },
  {
    table: "documents",
    key: "documents",
    columns: [
      "id", "entity_type", "entity_id", "doc_type", "file_url", "file_name",
      "uploaded_by", "created_at",
    ],
  },
];

/** Build a DB row from an object: whitelist columns, coerce "" → null. */
function toRow(obj: Record<string, unknown>, columns: string[]) {
  const row: Record<string, unknown> = {};
  for (const col of columns) {
    const value = obj[col];
    row[col] = value === undefined || value === "" ? null : value;
  }
  return row;
}

/** Read the full dataset from the relational tables. */
export async function readAllTables(sb: SupabaseClient): Promise<FundOSData> {
  const result = createBootstrapData();
  // Clear bootstrap defaults so we return exactly what the DB holds.
  for (const spec of TABLES) {
    (result[spec.key] as unknown[]) = [];
  }

  await Promise.all(
    TABLES.map(async (spec) => {
      const { data, error } = await sb.from(spec.table).select("*");
      if (error) throw new Error(`${spec.table}: ${error.message}`);
      (result[spec.key] as unknown[]) = data ?? [];
    }),
  );

  return result;
}

/**
 * Atomically replace all table contents with the given snapshot. Deletes every
 * row (children first) then inserts the new rows (parents first). Because there
 * are no FK constraints, this can never fail on ordering.
 */
export async function writeAllTables(
  sb: SupabaseClient,
  data: FundOSData,
): Promise<void> {
  // Delete in reverse (child → parent) for tidiness.
  for (let i = TABLES.length - 1; i >= 0; i--) {
    const spec = TABLES[i];
    const { error } = await sb
      .from(spec.table)
      .delete()
      .neq("id", "___never_matches___");
    if (error) throw new Error(`delete ${spec.table}: ${error.message}`);
  }

  // Insert in order (parent → child).
  for (const spec of TABLES) {
    const rows = (data[spec.key] ?? []) as unknown as Record<string, unknown>[];
    if (rows.length === 0) continue;
    const payload = rows.map((r) => toRow(r, spec.columns));
    const { error } = await sb.from(spec.table).insert(payload);
    if (error) throw new Error(`insert ${spec.table}: ${error.message}`);
  }
}

const SYNC_ID = "singleton";

/** Read the last-write timestamp (epoch ms) used for live sync. */
export async function readSyncTimestamp(
  sb: SupabaseClient,
): Promise<number | null> {
  const { data } = await sb
    .from("sync_state")
    .select("updated_at")
    .eq("id", SYNC_ID)
    .maybeSingle();
  if (!data?.updated_at) return null;
  const ms = Date.parse(data.updated_at as string);
  return Number.isFinite(ms) ? ms : null;
}

/** Bump the last-write timestamp; returns the new ISO string. */
export async function bumpSyncTimestamp(sb: SupabaseClient): Promise<string> {
  const updatedAt = new Date().toISOString();
  await sb
    .from("sync_state")
    .upsert({ id: SYNC_ID, updated_at: updatedAt }, { onConflict: "id" });
  return updatedAt;
}

/** True when any core portfolio table has rows. */
export function hasRelationalData(data: FundOSData): boolean {
  return (
    data.companies.length > 0 ||
    data.investmentLots.length > 0 ||
    data.funds.length > 0
  );
}
