-- FundOS Portfolio Schema v2
-- - Snapshot date format: YYYY-MM-DD (e.g. 2024-08-29) on capture
-- - Deal sourcing: deal_owner + deal_lead on deals
-- - Auto-generated unique abbreviations (e.g. Super Living → SL)
-- - Company valuation cache fields (Airtable parity)
-- - Valuation event codes (VE-{abbr}-{YYYY-MM-DD})

-- ============================================================
-- DEALS: deal_owner + deal_lead (sourcing accountability)
-- ============================================================

ALTER TABLE deals RENAME COLUMN owner_id TO deal_owner_id;

ALTER TABLE deals
  ADD COLUMN deal_owner TEXT,
  ADD COLUMN deal_lead  TEXT,
  ADD COLUMN deal_lead_id UUID;

COMMENT ON COLUMN deals.source         IS 'Deal channel: inbound, outbound, partner_referral, etc.';
COMMENT ON COLUMN deals.deal_owner     IS 'Internal owner responsible for the deal';
COMMENT ON COLUMN deals.deal_lead      IS 'Person who sourced or leads the opportunity';
COMMENT ON COLUMN deals.deal_owner_id  IS 'Future FK to profiles — internal deal owner';
COMMENT ON COLUMN deals.deal_lead_id   IS 'Future FK to profiles — deal lead / sourcer';

-- ============================================================
-- COMPANIES: valuation cache (Last Priced Round / Approved Mark)
-- ============================================================

ALTER TABLE companies
  ADD COLUMN last_priced_round_date         DATE,
  ADD COLUMN last_approved_post_money_local NUMERIC(20, 2),
  ADD COLUMN last_approved_price_per_share  NUMERIC(20, 6);

COMMENT ON COLUMN companies.last_priced_round_date         IS 'Last priced round date at approved mark';
COMMENT ON COLUMN companies.last_approved_post_money_local   IS 'Last approved post-money valuation (local currency)';
COMMENT ON COLUMN companies.last_approved_price_per_share    IS 'Last approved price per share at mark';
COMMENT ON COLUMN companies.latest_mark_price_date           IS 'Latest mark date (snapshot capture date YYYY-MM-DD)';

-- Allow auto-generated abbr on insert
ALTER TABLE companies ALTER COLUMN abbr DROP NOT NULL;

-- ============================================================
-- VALUATION MARKS: auto event code (Valuation Events in Airtable)
-- ============================================================

ALTER TABLE valuation_marks
  ADD COLUMN event_code TEXT UNIQUE;

COMMENT ON COLUMN valuation_marks.event_code IS 'Auto: VE-{company_abbr}-{YYYY-MM-DD}';
COMMENT ON COLUMN position_snapshots.snapshot_date IS 'Snapshot capture date as YYYY-MM-DD e.g. 2024-08-29';
COMMENT ON COLUMN position_snapshots.snapshot_code IS 'Auto: SNAP-{lot_code}-{YYYY-MM-DD}';

-- ============================================================
-- AUTO-GENERATE UNIQUE ABBREVIATIONS
-- Super Living → SL | collision → SL2, SL3, ...
-- ============================================================

CREATE OR REPLACE FUNCTION generate_unique_abbr(
  p_name          TEXT,
  p_fund_brand_id UUID,
  p_exclude_id    UUID DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
  v_words     TEXT[];
  v_word      TEXT;
  v_abbr      TEXT := '';
  v_candidate TEXT;
  v_suffix    INT := 2;
  v_clean     TEXT;
  v_stopwords TEXT[] := ARRAY[
    'pvt', 'ltd', 'limited', 'inc', 'corp', 'corporation',
    'llc', 'lp', 'llp', 'the', 'and', 'of', 'co', 'company'
  ];
BEGIN
  v_clean := upper(regexp_replace(trim(p_name), '[^a-zA-Z0-9\s]', ' ', 'g'));
  v_words := regexp_split_to_array(v_clean, '\s+');

  FOREACH v_word IN ARRAY v_words LOOP
    IF length(v_word) > 0 AND NOT (lower(v_word) = ANY (v_stopwords)) THEN
      v_abbr := v_abbr || left(v_word, 1);
    END IF;
  END LOOP;

  IF length(v_abbr) < 2 THEN
    v_abbr := upper(left(regexp_replace(v_clean, '\s', '', 'g'), 2));
  END IF;

  v_abbr := left(v_abbr, 4);
  v_candidate := v_abbr;

  WHILE EXISTS (
    SELECT 1 FROM companies
    WHERE fund_brand_id = p_fund_brand_id
      AND abbr = v_candidate
      AND (p_exclude_id IS NULL OR id <> p_exclude_id)
  ) LOOP
    IF v_suffix > 99 THEN
      v_candidate := upper(left(replace(gen_random_uuid()::TEXT, '-', ''), 4));
      EXIT;
    END IF;
    v_candidate := left(v_abbr, GREATEST(1, 4 - length(v_suffix::TEXT))) || v_suffix::TEXT;
    v_suffix := v_suffix + 1;
  END LOOP;

  RETURN v_candidate;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_company_abbr()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.abbr IS NULL OR btrim(NEW.abbr) = '' THEN
    NEW.abbr := generate_unique_abbr(
      COALESCE(NULLIF(btrim(NEW.brand_name), ''), NEW.legal_name),
      NEW.fund_brand_id,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_company_abbr
  BEFORE INSERT OR UPDATE OF brand_name, legal_name, abbr ON companies
  FOR EACH ROW EXECUTE FUNCTION set_company_abbr();

-- ============================================================
-- VALUATION MARK: auto event_code
-- ============================================================

CREATE OR REPLACE FUNCTION set_valuation_event_code()
RETURNS TRIGGER AS $$
DECLARE
  v_abbr TEXT;
BEGIN
  SELECT abbr INTO v_abbr FROM companies WHERE id = NEW.company_id;
  NEW.event_code := 'VE-' || v_abbr || '-' || to_char(NEW.valuation_date, 'YYYY-MM-DD');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_valuation_event_code
  BEFORE INSERT OR UPDATE OF company_id, valuation_date ON valuation_marks
  FOR EACH ROW EXECUTE FUNCTION set_valuation_event_code();

-- ============================================================
-- SYNC COMPANY VALUATION CACHE on approved mark
-- ============================================================

CREATE OR REPLACE FUNCTION sync_company_valuation_cache()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.approval_status = 'approved' THEN
    UPDATE companies SET
      latest_mark_price              = NEW.price_per_share_local,
      latest_mark_price_date         = NEW.valuation_date,
      last_approved_price_per_share  = NEW.price_per_share_local,
      last_approved_post_money_local = NEW.post_money_local,
      last_priced_round_date         = NEW.valuation_date,
      updated_at                     = now()
    WHERE id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_company_valuation_cache
  AFTER INSERT OR UPDATE OF approval_status, price_per_share_local,
    post_money_local, valuation_date ON valuation_marks
  FOR EACH ROW EXECUTE FUNCTION sync_company_valuation_cache();

-- ============================================================
-- UPDATE create_position_snapshot (YYYY-MM-DD capture date)
-- ============================================================

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
  v_date_str  TEXT;
BEGIN
  SELECT * INTO v_lot FROM investment_lots WHERE id = p_lot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lot not found: %', p_lot_id;
  END IF;

  v_date_str := to_char(p_snapshot_date, 'YYYY-MM-DD');
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
    'SNAP-' || v_lot.code || '-' || v_date_str,
    p_snapshot_date,
    COALESCE(p_as_converted, v_lot.shares_acquired), p_ownership_pct,
    p_mark_pps_local, v_lot.currency, p_fx_rate, p_mark_factor,
    v_fmv_local, v_fmv_fund, v_cost,
    v_fmv_fund - v_cost,
    CASE WHEN v_cost > 0 THEN ROUND(v_fmv_fund / v_cost, 4) ELSE 0 END,
    p_notes
  )
  ON CONFLICT (lot_id, snapshot_date) DO UPDATE SET
    valuation_mark_id          = EXCLUDED.valuation_mark_id,
    snapshot_code              = 'SNAP-' || v_lot.code || '-' || v_date_str,
    mark_price_per_share_local = EXCLUDED.mark_price_per_share_local,
    fx_rate_at_mark            = EXCLUDED.fx_rate_at_mark,
    mark_factor                = EXCLUDED.mark_factor,
    as_converted_shares        = EXCLUDED.as_converted_shares,
    ownership_pct_at_event     = EXCLUDED.ownership_pct_at_event,
    fmv_local                  = EXCLUDED.fmv_local,
    fmv_fund                   = EXCLUDED.fmv_fund,
    cost_basis_fund            = EXCLUDED.cost_basis_fund,
    unrealized_gain_loss_fund  = EXCLUDED.unrealized_gain_loss_fund,
    moic_at_snapshot           = EXCLUDED.moic_at_snapshot,
    notes                      = EXCLUDED.notes
  RETURNING * INTO v_snap;

  RETURN v_snap;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- VIEWS: Fund company board (Airtable Fund 2 grid parity)
-- ============================================================

CREATE OR REPLACE VIEW v_fund_company_board AS
SELECT
  f.id   AS fund_id,
  f.code AS fund_code,
  f.name AS fund_name,
  c.id   AS company_id,
  c.abbr AS company_abbr,
  c.legal_name,
  c.brand_name,
  c.last_priced_round_date,
  c.last_approved_post_money_local,
  c.last_approved_price_per_share,
  c.latest_mark_price_date AS latest_mark_date,
  COALESCE(
    array_agg(DISTINCT il.id ORDER BY il.id)
      FILTER (WHERE il.id IS NOT NULL),
    '{}'
  ) AS investment_lot_ids,
  COALESCE(
    array_agg(DISTINCT vm.id ORDER BY vm.id)
      FILTER (WHERE vm.id IS NOT NULL),
    '{}'
  ) AS valuation_event_ids
FROM funds f
JOIN investment_lots il ON il.fund_id = f.id
JOIN companies c ON c.id = il.company_id
LEFT JOIN valuation_marks vm ON vm.company_id = c.id
GROUP BY f.id, c.id;

CREATE OR REPLACE VIEW v_company_valuation_summary AS
SELECT
  c.id AS company_id,
  c.abbr,
  c.legal_name,
  c.last_priced_round_date,
  c.last_approved_post_money_local,
  c.last_approved_price_per_share,
  c.latest_mark_price_date AS latest_mark_date,
  c.operating_currency
FROM companies c;

-- ============================================================
-- BACKFILL existing seed data
-- ============================================================

UPDATE valuation_marks vm
SET event_code = 'VE-' || c.abbr || '-' || to_char(vm.valuation_date, 'YYYY-MM-DD')
FROM companies c
WHERE c.id = vm.company_id
  AND vm.event_code IS NULL;

UPDATE companies c
SET
  last_priced_round_date         = vm.valuation_date,
  last_approved_post_money_local = vm.post_money_local,
  last_approved_price_per_share  = vm.price_per_share_local
FROM valuation_marks vm
WHERE vm.company_id = c.id
  AND vm.valuation_date = '2024-08-29'
  AND vm.approval_status = 'approved'
  AND c.abbr = 'SL';

UPDATE deals SET
  deal_owner = 'Investment Team',
  deal_lead  = 'Internal Sourcing'
WHERE id = 'd0000000-0000-4000-8000-000000000001';

UPDATE deals SET
  deal_owner = 'Investment Team',
  deal_lead  = 'Partner Network'
WHERE id = 'd0000000-0000-4000-8000-000000000002';
