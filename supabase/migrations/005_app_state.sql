-- ============================================================
-- 005: Application state snapshot (JSON document store)
-- ------------------------------------------------------------
-- FundOS persists its full in-memory dataset (FundOSData) as a
-- single JSON document. This avoids UUID/FK coupling with the
-- app's text ids and lets ingestion + every mutation persist
-- atomically. Writes go through a server route using the
-- service_role key; the browser (anon) is read-only.
-- ============================================================

CREATE TABLE IF NOT EXISTS app_state (
  id         TEXT PRIMARY KEY,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;

-- Anon/authenticated may read the snapshot (dashboard load).
DROP POLICY IF EXISTS app_state_read ON app_state;
CREATE POLICY app_state_read
  ON app_state
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- No anon/authenticated write policies: all writes use the
-- service_role key (server API route), which bypasses RLS.
