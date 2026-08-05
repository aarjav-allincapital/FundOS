-- Alternate and historical company names used by entity resolution.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN companies.aliases IS
  'Alternate, former, abbreviated, and commonly encountered company names.';

