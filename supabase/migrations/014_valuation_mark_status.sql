-- 014_valuation_mark_status.sql
-- Valuation-mark taxonomy redesign.
--
-- New taxonomy (valuation_type is TEXT since migration 007, so no enum surgery):
--   entry_round    — we lead the round (our priced entry)
--   external_mark  — a third-party / round price, with a sub-status:
--                      mark_status = 'termsheet'  (round OPEN, informational)
--                      mark_status = 'closed'     (round closed, reprices NAV)
--   write_down     — partial impairment
--   write_off      — total loss
--
-- The legacy 'round_pricing' and 'internal_mark' values are folded into a
-- closed external mark (safe default — nothing is lost, NAV is unchanged).

ALTER TABLE valuation_marks
  ADD COLUMN IF NOT EXISTS mark_status TEXT;

-- Backfill sub-status for existing rows.
UPDATE valuation_marks
SET valuation_type = 'external_mark',
    mark_status    = 'closed'
WHERE valuation_type IN ('round_pricing', 'internal_mark');

-- Any pre-existing external marks were closed rounds.
UPDATE valuation_marks
SET mark_status = 'closed'
WHERE valuation_type = 'external_mark'
  AND mark_status IS NULL;

COMMENT ON COLUMN valuation_marks.mark_status IS
  'External-mark sub-status: termsheet (round open, informational) | closed (reprices NAV). NULL for entry_round / write_down / write_off.';
