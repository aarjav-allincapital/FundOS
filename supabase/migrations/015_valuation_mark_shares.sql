-- 015_valuation_mark_shares.sql
-- Capture the SHA share count on a valuation mark (closed / entry rounds), and
-- retire the valuation-mark "write_off" type — write-offs are recorded only as
-- exits/realizations now. Any legacy write_off marks fold into write_down
-- (still a mark to the given price, typically 0), so NAV is unchanged.

ALTER TABLE valuation_marks
  ADD COLUMN IF NOT EXISTS shares NUMERIC;

UPDATE valuation_marks
SET valuation_type = 'write_down'
WHERE valuation_type = 'write_off';

COMMENT ON COLUMN valuation_marks.shares IS
  'Share count from the SHA for closed / entry-round marks (reference; NULL for term sheets / write-downs).';
