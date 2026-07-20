-- ============================================================
-- 006: OTP codes for Resend-powered email verification
-- Accessed only via service_role (no RLS policies).
-- ============================================================

CREATE TABLE IF NOT EXISTS auth_otps (
  email       TEXT PRIMARY KEY,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_otps_expires_at_idx ON auth_otps (expires_at);

ALTER TABLE auth_otps ENABLE ROW LEVEL SECURITY;
