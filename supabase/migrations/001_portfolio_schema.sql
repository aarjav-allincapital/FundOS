-- FundOS Portfolio Schema
-- Fund 1 (F1) = USD | Fund 2 (F2) = INR
-- Nomenclature: {BRAND}-{FUND}-{COMPANY}-{LOT} e.g. AIC-F2-SL-0001

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE instrument_type AS ENUM (
  'ccps',
  'preferred',
  'common',
  'safe',
  'note'
);

CREATE TYPE lot_status AS ENUM (
  'draft',
  'termsheet',
  'committed',
  'active',
  'partial_exit',
  'full_exit',
  'written_off'
);

CREATE TYPE valuation_type AS ENUM (
  'round_pricing',
  'internal_mark',
  'external_mark',
  'write_down',
  'write_off'
);

CREATE TYPE deal_stage AS ENUM (
  'sourcing',
  'first_call',
  'second_call',
  'investment_committee',
  'closing',
  'post_investment',
  'monitoring',
  'exit',
  'passed',
  'archived'
);

CREATE TYPE deal_source AS ENUM (
  'inbound',
  'outbound',
  'partner_referral',
  'internal_lead',
  'external_lead'
);

-- ============================================================
-- FUND LAYER
-- ============================================================

CREATE TABLE fund_brands (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  abbr       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE funds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_brand_id UUID NOT NULL REFERENCES fund_brands(id),
  vehicle_code  TEXT NOT NULL,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  currency      TEXT NOT NULL,
  vintage_year  INT,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fund_brand_id, vehicle_code)
);

-- ============================================================
-- COMPANIES & FOUNDERS
-- ============================================================

CREATE TABLE companies (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_brand_id        UUID NOT NULL REFERENCES fund_brands(id),
  abbr                 TEXT NOT NULL,
  legal_name           TEXT NOT NULL,
  brand_name           TEXT,
  sector               TEXT,
  hq_country           TEXT,
  hq_city              TEXT,
  website              TEXT,
  operating_currency   TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'active',
  latest_mark_price    NUMERIC(20, 6),
  latest_mark_price_date DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fund_brand_id, abbr)
);

CREATE TABLE founders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  role       TEXT,
  background TEXT,
  email      TEXT,
  phone      TEXT,
  linkedin_url TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CRM / DEAL PIPELINE
-- ============================================================

CREATE TABLE deals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id             UUID NOT NULL REFERENCES funds(id),
  company_id          UUID REFERENCES companies(id),
  stage               deal_stage NOT NULL DEFAULT 'sourcing',
  source              deal_source,
  owner_id            UUID,
  expected_investment NUMERIC(20, 2),
  committed_amount    NUMERIC(20, 2),
  wired_amount        NUMERIC(20, 2),
  currency            TEXT NOT NULL DEFAULT 'USD',
  expected_close_date DATE,
  actual_close_date   DATE,
  is_first_investment BOOLEAN,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE deal_stage_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id    UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  from_stage deal_stage,
  to_stage   deal_stage NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes      TEXT
);

-- ============================================================
-- ROUNDS
-- ============================================================

CREATE TABLE rounds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id),
  deal_id             UUID REFERENCES deals(id),
  round_name          TEXT NOT NULL,
  round_date          DATE,
  our_role            TEXT,
  status              TEXT NOT NULL DEFAULT 'active',
  price_per_share     NUMERIC(20, 6),
  currency            TEXT NOT NULL,
  pre_money_local     NUMERIC(20, 2),
  post_money_local    NUMERIC(20, 2),
  pre_money_fund      NUMERIC(20, 2),
  post_money_fund     NUMERIC(20, 2),
  fx_rate             NUMERIC(20, 8),
  old_total_shares    BIGINT,
  new_shares_issued   BIGINT,
  new_total_shares    BIGINT,
  thesis_summary      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, round_name, round_date)
);

CREATE TABLE round_investors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id     UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  is_lead      BOOLEAN DEFAULT false,
  amount_local NUMERIC(20, 2),
  currency     TEXT
);

-- ============================================================
-- TERM SHEETS
-- ============================================================

CREATE TABLE term_sheets (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id                   UUID NOT NULL REFERENCES deals(id),
  round_id                  UUID REFERENCES rounds(id),
  side                      TEXT NOT NULL DEFAULT 'ours',
  status                    TEXT NOT NULL DEFAULT 'draft',
  vehicle                   instrument_type NOT NULL,
  proposed_investment_local NUMERIC(20, 2),
  currency                  TEXT NOT NULL,
  tentative_fx_rate         NUMERIC(20, 8),
  proposed_investment_fund  NUMERIC(20, 2),
  indicated_valuation_local NUMERIC(20, 2),
  is_post_money             BOOLEAN DEFAULT false,
  implied_price_per_share   NUMERIC(20, 6),
  rights_and_terms          JSONB,
  round_name                TEXT,
  moic_at_entry             NUMERIC(10, 4),
  signed_at                 TIMESTAMPTZ,
  investment_lot_id         UUID,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INVESTMENT LOTS
-- ============================================================

CREATE TABLE investment_lots (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id                UUID NOT NULL REFERENCES funds(id),
  company_id             UUID NOT NULL REFERENCES companies(id),
  round_id               UUID NOT NULL REFERENCES rounds(id),
  deal_id                UUID REFERENCES deals(id),
  term_sheet_id          UUID UNIQUE REFERENCES term_sheets(id),
  lot_sequence           INT NOT NULL,
  code                   TEXT NOT NULL UNIQUE,
  investment_date        DATE NOT NULL,
  transaction_type       TEXT NOT NULL DEFAULT 'primary',
  vehicle                instrument_type NOT NULL,
  shares_acquired        NUMERIC(20, 6),
  price_per_share_local  NUMERIC(20, 6) NOT NULL,
  currency               TEXT NOT NULL,
  cash_invested_local    NUMERIC(20, 2) NOT NULL,
  cash_invested_fund     NUMERIC(20, 2) NOT NULL,
  fx_rate_at_entry       NUMERIC(20, 8) NOT NULL,
  ownership_at_entry_pct NUMERIC(10, 6),
  rights_and_terms       JSONB,
  moic_on_prior_lot      NUMERIC(10, 4),
  overwrote_term_sheet   BOOLEAN DEFAULT false,
  status                 lot_status NOT NULL DEFAULT 'active',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fund_id, company_id, lot_sequence)
);

ALTER TABLE term_sheets
  ADD CONSTRAINT term_sheets_investment_lot_id_fkey
  FOREIGN KEY (investment_lot_id) REFERENCES investment_lots(id);

-- ============================================================
-- VALUATION MARKS (company level)
-- ============================================================

CREATE TABLE valuation_marks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id),
  valuation_date        DATE NOT NULL,
  valuation_type        valuation_type NOT NULL,
  price_per_share_local NUMERIC(20, 6) NOT NULL,
  currency              TEXT NOT NULL,
  pre_money_local       NUMERIC(20, 2),
  post_money_local      NUMERIC(20, 2),
  source                TEXT,
  approval_status       TEXT DEFAULT 'approved',
  approved_by           UUID,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, valuation_date, valuation_type)
);

-- ============================================================
-- POSITION SNAPSHOTS (lot level, dual currency)
-- ============================================================

CREATE TABLE position_snapshots (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id                    UUID NOT NULL REFERENCES investment_lots(id),
  valuation_mark_id           UUID REFERENCES valuation_marks(id),
  snapshot_code             TEXT NOT NULL UNIQUE,
  snapshot_date             DATE NOT NULL,
  as_converted_shares       NUMERIC(20, 6) NOT NULL,
  ownership_pct_at_event    NUMERIC(10, 6),
  mark_price_per_share_local NUMERIC(20, 6) NOT NULL,
  currency                  TEXT NOT NULL,
  fx_rate_at_mark           NUMERIC(20, 8) NOT NULL DEFAULT 1,
  mark_factor               NUMERIC(10, 6) NOT NULL DEFAULT 1,
  fmv_local                 NUMERIC(20, 2) NOT NULL,
  fmv_fund                  NUMERIC(20, 2) NOT NULL,
  cost_basis_fund           NUMERIC(20, 2) NOT NULL,
  unrealized_gain_loss_fund NUMERIC(20, 2) NOT NULL,
  moic_at_snapshot          NUMERIC(10, 4) NOT NULL,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                UUID,
  UNIQUE (lot_id, snapshot_date)
);

CREATE INDEX position_snapshots_lot_date_idx ON position_snapshots (lot_id, snapshot_date DESC);
CREATE INDEX position_snapshots_date_idx ON position_snapshots (snapshot_date);

-- ============================================================
-- FX RATES
-- ============================================================

CREATE TABLE fx_rates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency TEXT NOT NULL,
  to_currency   TEXT NOT NULL,
  rate          NUMERIC(20, 8) NOT NULL,
  rate_date     DATE NOT NULL,
  source        TEXT,
  UNIQUE (from_currency, to_currency, rate_date)
);

-- ============================================================
-- REALIZATIONS / EXITS
-- ============================================================

CREATE TABLE realizations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id            UUID NOT NULL REFERENCES investment_lots(id),
  company_id        UUID NOT NULL REFERENCES companies(id),
  realization_date  DATE NOT NULL,
  event_type        TEXT NOT NULL,
  shares_sold       NUMERIC(20, 6),
  price_per_share   NUMERIC(20, 6),
  gross_amount      NUMERIC(20, 2),
  net_amount        NUMERIC(20, 2),
  currency          TEXT NOT NULL,
  fx_rate           NUMERIC(20, 8),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- DOCUMENTS (polymorphic)
-- ============================================================

CREATE TABLE documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  doc_type    TEXT NOT NULL,
  file_url    TEXT NOT NULL,
  file_name   TEXT,
  uploaded_by UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX documents_entity_idx ON documents (entity_type, entity_id);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION set_fund_code()
RETURNS TRIGGER AS $$
DECLARE
  v_brand_abbr TEXT;
BEGIN
  SELECT abbr INTO v_brand_abbr FROM fund_brands WHERE id = NEW.fund_brand_id;
  NEW.code := v_brand_abbr || '-' || NEW.vehicle_code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fund_code
  BEFORE INSERT OR UPDATE OF fund_brand_id, vehicle_code ON funds
  FOR EACH ROW EXECUTE FUNCTION set_fund_code();

CREATE OR REPLACE FUNCTION generate_lot_code()
RETURNS TRIGGER AS $$
DECLARE
  v_brand_abbr TEXT;
  v_vehicle    TEXT;
  v_co_abbr    TEXT;
BEGIN
  SELECT fb.abbr, f.vehicle_code, c.abbr
  INTO v_brand_abbr, v_vehicle, v_co_abbr
  FROM funds f
  JOIN fund_brands fb ON fb.id = f.fund_brand_id
  JOIN companies c ON c.id = NEW.company_id
  WHERE f.id = NEW.fund_id;

  IF NEW.lot_sequence IS NULL OR NEW.lot_sequence = 0 THEN
    SELECT COALESCE(MAX(lot_sequence), 0) + 1
    INTO NEW.lot_sequence
    FROM investment_lots
    WHERE fund_id = NEW.fund_id AND company_id = NEW.company_id;
  END IF;

  NEW.code := v_brand_abbr || '-' || v_vehicle || '-' || v_co_abbr
           || '-' || LPAD(NEW.lot_sequence::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lot_code
  BEFORE INSERT ON investment_lots
  FOR EACH ROW EXECUTE FUNCTION generate_lot_code();

CREATE OR REPLACE FUNCTION touch_company_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION touch_company_updated_at();

CREATE OR REPLACE FUNCTION create_position_snapshot(
  p_lot_id            UUID,
  p_snapshot_date     DATE,
  p_mark_pps_local    NUMERIC,
  p_fx_rate           NUMERIC DEFAULT 1,
  p_mark_factor       NUMERIC DEFAULT 1,
  p_as_converted      NUMERIC DEFAULT NULL,
  p_ownership_pct     NUMERIC DEFAULT NULL,
  p_valuation_mark_id UUID DEFAULT NULL,
  p_notes             TEXT DEFAULT NULL
) RETURNS position_snapshots AS $$
DECLARE
  v_lot       investment_lots%ROWTYPE;
  v_fmv_local NUMERIC;
  v_fmv_fund  NUMERIC;
  v_cost      NUMERIC;
  v_snap      position_snapshots%ROWTYPE;
BEGIN
  SELECT * INTO v_lot FROM investment_lots WHERE id = p_lot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lot not found: %', p_lot_id;
  END IF;

  v_cost := v_lot.cash_invested_fund;
  v_fmv_local := COALESCE(p_as_converted, v_lot.shares_acquired)
    * p_mark_pps_local * p_mark_factor;
  v_fmv_fund := v_fmv_local * p_fx_rate;

  INSERT INTO position_snapshots (
    lot_id, valuation_mark_id, snapshot_code, snapshot_date,
    as_converted_shares, ownership_pct_at_event,
    mark_price_per_share_local, currency, fx_rate_at_mark, mark_factor,
    fmv_local, fmv_fund, cost_basis_fund,
    unrealized_gain_loss_fund, moic_at_snapshot, notes
  ) VALUES (
    p_lot_id, p_valuation_mark_id,
    'SNAP-' || v_lot.code || '-' || to_char(p_snapshot_date, 'YYYY-MM-DD'),
    p_snapshot_date,
    COALESCE(p_as_converted, v_lot.shares_acquired), p_ownership_pct,
    p_mark_pps_local, v_lot.currency, p_fx_rate, p_mark_factor,
    v_fmv_local, v_fmv_fund, v_cost,
    v_fmv_fund - v_cost,
    CASE WHEN v_cost > 0 THEN ROUND(v_fmv_fund / v_cost, 4) ELSE 0 END,
    p_notes
  )
  ON CONFLICT (lot_id, snapshot_date) DO UPDATE SET
    valuation_mark_id        = EXCLUDED.valuation_mark_id,
    mark_price_per_share_local = EXCLUDED.mark_price_per_share_local,
    fx_rate_at_mark          = EXCLUDED.fx_rate_at_mark,
    mark_factor              = EXCLUDED.mark_factor,
    as_converted_shares      = EXCLUDED.as_converted_shares,
    ownership_pct_at_event   = EXCLUDED.ownership_pct_at_event,
    fmv_local                = EXCLUDED.fmv_local,
    fmv_fund                 = EXCLUDED.fmv_fund,
    cost_basis_fund          = EXCLUDED.cost_basis_fund,
    unrealized_gain_loss_fund = EXCLUDED.unrealized_gain_loss_fund,
    moic_at_snapshot         = EXCLUDED.moic_at_snapshot,
    notes                    = EXCLUDED.notes
  RETURNING * INTO v_snap;

  UPDATE companies SET
    latest_mark_price      = p_mark_pps_local,
    latest_mark_price_date = p_snapshot_date,
    updated_at             = now()
  WHERE id = v_lot.company_id;

  RETURN v_snap;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fan_out_valuation_snapshots(
  p_valuation_mark_id UUID
) RETURNS INT AS $$
DECLARE
  v_mark      valuation_marks%ROWTYPE;
  v_lot       RECORD;
  v_fx_rate   NUMERIC;
  v_count     INT := 0;
BEGIN
  SELECT * INTO v_mark FROM valuation_marks WHERE id = p_valuation_mark_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Valuation mark not found: %', p_valuation_mark_id;
  END IF;

  FOR v_lot IN
    SELECT il.*
    FROM investment_lots il
    JOIN funds f ON f.id = il.fund_id
    WHERE il.company_id = v_mark.company_id
      AND il.status = 'active'
  LOOP
    SELECT COALESCE(
      (SELECT rate FROM fx_rates
       WHERE from_currency = v_mark.currency
         AND to_currency = (SELECT currency FROM funds WHERE id = v_lot.fund_id)
         AND rate_date <= v_mark.valuation_date
       ORDER BY rate_date DESC LIMIT 1),
      CASE WHEN v_mark.currency = (SELECT currency FROM funds WHERE id = v_lot.fund_id)
           THEN 1 ELSE NULL END
    ) INTO v_fx_rate;

    IF v_fx_rate IS NULL THEN
      RAISE WARNING 'No FX rate for lot % (% -> fund currency) on %',
        v_lot.code, v_mark.currency, v_mark.valuation_date;
      CONTINUE;
    END IF;

    PERFORM create_position_snapshot(
      v_lot.id,
      v_mark.valuation_date,
      v_mark.price_per_share_local,
      v_fx_rate,
      1,
      v_lot.shares_acquired,
      v_lot.ownership_at_entry_pct,
      p_valuation_mark_id,
      v_mark.notes
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- VIEWS
-- ============================================================

CREATE VIEW v_lot_current AS
SELECT DISTINCT ON (il.id)
  il.id AS lot_id,
  il.code AS lot_code,
  il.vehicle,
  f.code AS fund_code,
  f.currency AS fund_currency,
  c.abbr AS company_abbr,
  c.legal_name AS company_name,
  r.round_name,
  r.our_role,
  ps.snapshot_date,
  ps.as_converted_shares,
  ps.mark_price_per_share_local,
  ps.currency AS company_currency,
  ps.fx_rate_at_mark,
  ps.fmv_local,
  ps.fmv_fund,
  ps.cost_basis_fund,
  ps.unrealized_gain_loss_fund,
  ps.moic_at_snapshot
FROM investment_lots il
JOIN funds f ON f.id = il.fund_id
JOIN companies c ON c.id = il.company_id
JOIN rounds r ON r.id = il.round_id
LEFT JOIN position_snapshots ps ON ps.lot_id = il.id
ORDER BY il.id, ps.snapshot_date DESC NULLS LAST;

CREATE VIEW v_company_portfolio AS
SELECT
  c.id AS company_id,
  c.abbr,
  c.legal_name,
  c.operating_currency,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'active') AS active_rounds,
  COUNT(il.id) AS total_lots,
  SUM(lc.fmv_fund) AS total_fmv_fund
FROM companies c
LEFT JOIN rounds r ON r.company_id = c.id
LEFT JOIN investment_lots il ON il.company_id = c.id
LEFT JOIN v_lot_current lc ON lc.lot_id = il.id
GROUP BY c.id;

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO fund_brands (id, abbr, name)
VALUES ('a0000000-0000-4000-8000-000000000001', 'AIC', 'All In Capital');

INSERT INTO funds (id, fund_brand_id, vehicle_code, code, name, currency, vintage_year)
VALUES
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'F1', 'AIC-F1', 'Fund 1', 'USD', 2022),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'F2', 'AIC-F2', 'Fund 2', 'INR', 2023);

INSERT INTO companies (
  id, fund_brand_id, abbr, legal_name, brand_name, sector,
  hq_country, hq_city, operating_currency, status
) VALUES (
  'c0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'SL',
  'Super Living Pvt Ltd',
  'Super Living',
  'Consumer / D2C',
  'IN',
  'Mumbai',
  'INR',
  'active'
);

INSERT INTO founders (company_id, name, role, is_primary)
VALUES
  ('c0000000-0000-4000-8000-000000000001', 'Founder One', 'CEO', true),
  ('c0000000-0000-4000-8000-000000000001', 'Founder Two', 'COO', false);

INSERT INTO fx_rates (from_currency, to_currency, rate, rate_date, source)
VALUES
  ('INR', 'USD', 0.01200000, '2024-08-29', 'manual'),
  ('INR', 'USD', 0.01210000, '2025-10-10', 'manual'),
  ('USD', 'INR', 83.33000000, '2024-08-29', 'manual'),
  ('INR', 'INR', 1.00000000, '2024-08-29', 'identity'),
  ('INR', 'INR', 1.00000000, '2025-10-10', 'identity');

INSERT INTO deals (id, fund_id, company_id, stage, source, currency, is_first_investment, actual_close_date)
VALUES
  (
    'd0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000002',
    'c0000000-0000-4000-8000-000000000001',
    'post_investment',
    'internal_lead',
    'INR',
    true,
    '2023-06-15'
  ),
  (
    'd0000000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'post_investment',
    'partner_referral',
    'INR',
    false,
    '2024-03-20'
  );

INSERT INTO rounds (
  id, company_id, deal_id, round_name, round_date, our_role, status,
  price_per_share, currency, pre_money_local, post_money_local, fx_rate
) VALUES
  (
    'e0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001',
    'Seed',
    '2023-06-15',
    'lead',
    'active',
    25000.000000,
    'INR',
    800000000.00,
    1000000000.00,
    1.00000000
  ),
  (
    'e0000000-0000-4000-8000-000000000002',
    'c0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002',
    'Series A',
    '2024-03-20',
    'co_invest',
    'active',
    36742.190000,
    'INR',
    3500000000.00,
    4500000000.00,
    0.01200000
  );

INSERT INTO round_investors (round_id, name, is_lead, amount_local, currency)
VALUES
  ('e0000000-0000-4000-8000-000000000001', 'All In Capital (F2)', true, 200000000.00, 'INR'),
  ('e0000000-0000-4000-8000-000000000002', 'All In Capital (F1)', false, 50000000.00, 'INR'),
  ('e0000000-0000-4000-8000-000000000002', 'Lead VC Fund', true, 300000000.00, 'INR');

INSERT INTO term_sheets (
  id, deal_id, round_id, status, vehicle,
  proposed_investment_local, currency, tentative_fx_rate,
  proposed_investment_fund, indicated_valuation_local, is_post_money,
  implied_price_per_share, round_name, signed_at
) VALUES
  (
    'f0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001',
    'signed',
    'ccps',
    200000000.00,
    'INR',
    1.00000000,
    200000000.00,
    1000000000.00,
    true,
    25000.000000,
    'Seed',
    '2023-05-01 00:00:00+00'
  ),
  (
    'f0000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000002',
    'e0000000-0000-4000-8000-000000000002',
    'signed',
    'preferred',
    50000000.00,
    'INR',
    0.01200000,
    600000.00,
    4500000000.00,
    true,
    36742.190000,
    'Series A',
    '2024-02-15 00:00:00+00'
  );

INSERT INTO investment_lots (
  id, fund_id, company_id, round_id, deal_id, term_sheet_id,
  lot_sequence, code, investment_date, vehicle,
  shares_acquired, price_per_share_local, currency,
  cash_invested_local, cash_invested_fund, fx_rate_at_entry,
  ownership_at_entry_pct, status
) VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000002',
    'c0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001',
    1,
    'AIC-F2-SL-0001',
    '2023-06-15',
    'ccps',
    8000,
    25000.000000,
    'INR',
    200000000.00,
    200000000.00,
    1.00000000,
    8.000000,
    'active'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000002',
    'f0000000-0000-4000-8000-000000000002',
    1,
    'AIC-F1-SL-0001',
    '2024-03-20',
    'preferred',
    1360,
    36742.190000,
    'INR',
    50000000.00,
    600000.00,
    0.01200000,
    1.200000,
    'active'
  );

UPDATE term_sheets SET investment_lot_id = '10000000-0000-4000-8000-000000000001'
WHERE id = 'f0000000-0000-4000-8000-000000000001';
UPDATE term_sheets SET investment_lot_id = '10000000-0000-4000-8000-000000000002'
WHERE id = 'f0000000-0000-4000-8000-000000000002';

INSERT INTO valuation_marks (
  id, company_id, valuation_date, valuation_type,
  price_per_share_local, currency, pre_money_local, post_money_local, source, notes
) VALUES (
  '20000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  '2024-08-29',
  'internal_mark',
  36742.190000,
  'INR',
  3500000000.00,
  4500000000.00,
  'internal',
  'Q2 2024 portfolio mark'
);

SELECT create_position_snapshot(
  '10000000-0000-4000-8000-000000000001',
  '2024-08-29',
  36742.190000,
  1.00000000,
  1.00000000,
  1225,
  8.000000,
  '20000000-0000-4000-8000-000000000001',
  'Seed lot mark — as-converted shares post restructure'
);

SELECT create_position_snapshot(
  '10000000-0000-4000-8000-000000000002',
  '2024-08-29',
  36742.190000,
  0.01200000,
  1.00000000,
  1360,
  1.200000,
  '20000000-0000-4000-8000-000000000001',
  'Series A lot mark — F1 fund USD reporting'
);

INSERT INTO valuation_marks (
  id, company_id, valuation_date, valuation_type,
  price_per_share_local, currency, source, notes
) VALUES (
  '20000000-0000-4000-8000-000000000002',
  'c0000000-0000-4000-8000-000000000001',
  '2025-10-10',
  'internal_mark',
  73127.740000,
  'INR',
  'internal',
  'Q3 2025 portfolio mark'
);

SELECT create_position_snapshot(
  '10000000-0000-4000-8000-000000000001',
  '2025-10-10',
  73127.740000,
  1.00000000,
  1.00000000,
  358,
  8.000000,
  '20000000-0000-4000-8000-000000000002',
  'Updated mark Q3 2025'
);
