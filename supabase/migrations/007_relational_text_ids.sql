-- ============================================================
-- 007: Rebuild portfolio schema to match the app's data model 1:1
-- ------------------------------------------------------------
-- The application generates human-readable TEXT ids (e.g. "co-sl",
-- "lot-sl-f1", "fx1") and carries fields the original UUID schema
-- never had. This migration rebuilds every table with:
--   • TEXT primary keys / foreign-key columns (no UUID coupling)
--   • every column the TypeScript types expect
--   • DOUBLE PRECISION for numerics (returns as JS numbers, not strings)
--   • RLS: anon/authenticated may read; writes go via service_role
-- No FK constraints are enforced — the app owns integrity and writes
-- are done as an atomic full-replace, so ordering never fails.
-- ============================================================

-- Drop old JSON snapshot + legacy relational objects (starting fresh).
DROP TABLE IF EXISTS app_state CASCADE;

DROP VIEW IF EXISTS v_company_valuation_summary CASCADE;
DROP VIEW IF EXISTS v_fund_company_board CASCADE;
DROP VIEW IF EXISTS v_company_portfolio CASCADE;
DROP VIEW IF EXISTS v_lot_current CASCADE;

DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS realizations CASCADE;
DROP TABLE IF EXISTS fx_rates CASCADE;
DROP TABLE IF EXISTS position_snapshots CASCADE;
DROP TABLE IF EXISTS valuation_marks CASCADE;
DROP TABLE IF EXISTS investment_lots CASCADE;
DROP TABLE IF EXISTS term_sheets CASCADE;
DROP TABLE IF EXISTS round_investors CASCADE;
DROP TABLE IF EXISTS rounds CASCADE;
DROP TABLE IF EXISTS deal_stage_history CASCADE;
DROP TABLE IF EXISTS deals CASCADE;
DROP TABLE IF EXISTS founders CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS funds CASCADE;
DROP TABLE IF EXISTS fund_brands CASCADE;
DROP TABLE IF EXISTS sync_state CASCADE;

-- ------------------------------------------------------------
-- Tables (text ids, full column sets)
-- ------------------------------------------------------------

CREATE TABLE fund_brands (
  id         TEXT PRIMARY KEY,
  abbr       TEXT,
  name       TEXT,
  created_at TIMESTAMPTZ
);

CREATE TABLE funds (
  id                     TEXT PRIMARY KEY,
  fund_brand_id          TEXT,
  vehicle_code           TEXT,
  code                   TEXT,
  name                   TEXT,
  currency               TEXT,
  vintage_year           INTEGER,
  status                 TEXT,
  committed_capital_fund DOUBLE PRECISION,
  mgmt_fee_pct           DOUBLE PRECISION,
  mgmt_fee_basis         TEXT,
  carry_pct              DOUBLE PRECISION,
  hurdle_pct             DOUBLE PRECISION,
  waterfall_style        TEXT,
  catch_up               TEXT,
  created_at             TIMESTAMPTZ
);

CREATE TABLE companies (
  id                            TEXT PRIMARY KEY,
  fund_brand_id                 TEXT,
  abbr                          TEXT,
  legal_name                    TEXT,
  brand_name                    TEXT,
  sector                        TEXT,
  hq_country                    TEXT,
  hq_city                       TEXT,
  website                       TEXT,
  operating_currency            TEXT,
  status                        TEXT,
  latest_mark_price             DOUBLE PRECISION,
  latest_mark_price_date        DATE,
  last_priced_round_date        DATE,
  last_approved_post_money_local DOUBLE PRECISION,
  last_approved_price_per_share DOUBLE PRECISION,
  created_at                    TIMESTAMPTZ,
  updated_at                    TIMESTAMPTZ
);

CREATE TABLE founders (
  id           TEXT PRIMARY KEY,
  company_id   TEXT,
  name         TEXT,
  role         TEXT,
  background   TEXT,
  email        TEXT,
  phone        TEXT,
  linkedin_url TEXT,
  is_primary   BOOLEAN,
  created_at   TIMESTAMPTZ
);

CREATE TABLE deals (
  id                  TEXT PRIMARY KEY,
  fund_id             TEXT,
  company_id          TEXT,
  stage               TEXT,
  source              TEXT,
  deal_owner_id       TEXT,
  deal_owner          TEXT,
  deal_lead           TEXT,
  deal_lead_id        TEXT,
  expected_investment DOUBLE PRECISION,
  committed_amount    DOUBLE PRECISION,
  wired_amount        DOUBLE PRECISION,
  currency            TEXT,
  expected_close_date DATE,
  actual_close_date   DATE,
  is_first_investment BOOLEAN,
  notes               TEXT,
  created_at          TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ
);

CREATE TABLE deal_stage_history (
  id         TEXT PRIMARY KEY,
  deal_id    TEXT,
  from_stage TEXT,
  to_stage   TEXT,
  changed_by TEXT,
  changed_at TIMESTAMPTZ,
  notes      TEXT
);

CREATE TABLE rounds (
  id                TEXT PRIMARY KEY,
  company_id        TEXT,
  deal_id           TEXT,
  round_name        TEXT,
  round_date        DATE,
  our_role          TEXT,
  status            TEXT,
  price_per_share   DOUBLE PRECISION,
  currency          TEXT,
  pre_money_local   DOUBLE PRECISION,
  post_money_local  DOUBLE PRECISION,
  pre_money_fund    DOUBLE PRECISION,
  post_money_fund   DOUBLE PRECISION,
  fx_rate           DOUBLE PRECISION,
  old_total_shares  DOUBLE PRECISION,
  new_shares_issued DOUBLE PRECISION,
  new_total_shares  DOUBLE PRECISION,
  thesis_summary    TEXT,
  created_at        TIMESTAMPTZ
);

CREATE TABLE round_investors (
  id           TEXT PRIMARY KEY,
  round_id     TEXT,
  name         TEXT,
  is_lead      BOOLEAN,
  amount_local DOUBLE PRECISION,
  currency     TEXT
);

CREATE TABLE term_sheets (
  id                        TEXT PRIMARY KEY,
  deal_id                   TEXT,
  round_id                  TEXT,
  side                      TEXT,
  status                    TEXT,
  vehicle                   TEXT,
  proposed_investment_local DOUBLE PRECISION,
  currency                  TEXT,
  tentative_fx_rate         DOUBLE PRECISION,
  proposed_investment_fund  DOUBLE PRECISION,
  indicated_valuation_local DOUBLE PRECISION,
  is_post_money             BOOLEAN,
  implied_price_per_share   DOUBLE PRECISION,
  rights_and_terms          JSONB,
  round_name                TEXT,
  moic_at_entry             DOUBLE PRECISION,
  signed_at                 TIMESTAMPTZ,
  investment_lot_id         TEXT,
  created_at                TIMESTAMPTZ
);

CREATE TABLE investment_lots (
  id                     TEXT PRIMARY KEY,
  fund_id                TEXT,
  company_id             TEXT,
  round_id               TEXT,
  deal_id                TEXT,
  term_sheet_id          TEXT,
  lot_sequence           INTEGER,
  code                   TEXT,
  investment_date        DATE,
  transaction_type       TEXT,
  vehicle                TEXT,
  shares_acquired        DOUBLE PRECISION,
  price_per_share_local  DOUBLE PRECISION,
  currency               TEXT,
  cash_invested_local    DOUBLE PRECISION,
  cash_invested_fund     DOUBLE PRECISION,
  paid_in_capital_fund   DOUBLE PRECISION,
  fx_rate_at_entry       DOUBLE PRECISION,
  ownership_at_entry_pct DOUBLE PRECISION,
  rights_and_terms       JSONB,
  moic_on_prior_lot      DOUBLE PRECISION,
  overwrote_term_sheet   BOOLEAN,
  status                 TEXT,
  created_at             TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ
);

CREATE TABLE valuation_marks (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT,
  valuation_date        DATE,
  valuation_type        TEXT,
  price_per_share_local DOUBLE PRECISION,
  currency              TEXT,
  pre_money_local       DOUBLE PRECISION,
  post_money_local      DOUBLE PRECISION,
  source                TEXT,
  approval_status       TEXT,
  approved_by           TEXT,
  notes                 TEXT,
  event_code            TEXT,
  created_at            TIMESTAMPTZ
);

CREATE TABLE position_snapshots (
  id                        TEXT PRIMARY KEY,
  lot_id                    TEXT,
  valuation_mark_id         TEXT,
  snapshot_code             TEXT,
  snapshot_date             DATE,
  as_converted_shares       DOUBLE PRECISION,
  ownership_pct_at_event    DOUBLE PRECISION,
  mark_price_per_share_local DOUBLE PRECISION,
  currency                  TEXT,
  fx_rate_at_mark           DOUBLE PRECISION,
  mark_factor               DOUBLE PRECISION,
  fmv_local                 DOUBLE PRECISION,
  fmv_fund                  DOUBLE PRECISION,
  cost_basis_fund           DOUBLE PRECISION,
  unrealized_gain_loss_fund DOUBLE PRECISION,
  moic_at_snapshot          DOUBLE PRECISION,
  notes                     TEXT,
  created_at                TIMESTAMPTZ
);

CREATE TABLE fx_rates (
  id            TEXT PRIMARY KEY,
  from_currency TEXT,
  to_currency   TEXT,
  rate          DOUBLE PRECISION,
  rate_date     DATE,
  source        TEXT,
  purpose       TEXT
);

CREATE TABLE realizations (
  id               TEXT PRIMARY KEY,
  lot_id           TEXT,
  company_id       TEXT,
  realization_date DATE,
  event_type       TEXT,
  shares_sold      DOUBLE PRECISION,
  price_per_share  DOUBLE PRECISION,
  gross_amount     DOUBLE PRECISION,
  net_amount       DOUBLE PRECISION,
  currency         TEXT,
  fx_rate          DOUBLE PRECISION,
  notes            TEXT,
  created_at       TIMESTAMPTZ
);

CREATE TABLE documents (
  id          TEXT PRIMARY KEY,
  entity_type TEXT,
  entity_id   TEXT,
  doc_type    TEXT,
  file_url    TEXT,
  file_name   TEXT,
  uploaded_by TEXT,
  created_at  TIMESTAMPTZ
);

-- Single-row table holding the "last write" timestamp used for live sync.
CREATE TABLE sync_state (
  id         TEXT PRIMARY KEY,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Useful lookup indexes (non-unique — full-replace friendly).
CREATE INDEX founders_company_idx     ON founders (company_id);
CREATE INDEX deals_company_idx        ON deals (company_id);
CREATE INDEX rounds_company_idx       ON rounds (company_id);
CREATE INDEX lots_company_idx         ON investment_lots (company_id);
CREATE INDEX lots_fund_idx            ON investment_lots (fund_id);
CREATE INDEX marks_company_idx        ON valuation_marks (company_id);
CREATE INDEX snapshots_lot_idx        ON position_snapshots (lot_id);
CREATE INDEX realizations_company_idx ON realizations (company_id);

-- ------------------------------------------------------------
-- Row Level Security: anon/authenticated read-only; writes via service_role.
-- ------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fund_brands','funds','companies','founders','deals','deal_stage_history',
    'rounds','round_investors','term_sheets','investment_lots','valuation_marks',
    'position_snapshots','fx_rates','realizations','documents','sync_state'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON %I;', t, t);
    EXECUTE format(
      'CREATE POLICY %I_read ON %I FOR SELECT TO anon, authenticated USING (true);',
      t, t
    );
  END LOOP;
END $$;
