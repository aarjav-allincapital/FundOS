-- ============================================================
-- 012: App-level RBAC (admin | org_user)
-- Accessed via service_role from Next.js API routes.
-- ============================================================

CREATE TABLE IF NOT EXISTS app_users (
  email       TEXT PRIMARY KEY,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'org_user')),
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('invited', 'active', 'disabled')),
  invited_by  TEXT,
  invited_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_users_role_idx ON app_users (role);
CREATE INDEX IF NOT EXISTS app_users_status_idx ON app_users (status);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- Bootstrap admins (idempotent). Role management stays Kushal-only in app code.
INSERT INTO app_users (email, role, status)
VALUES
  ('kushal@allincapital.vc', 'admin', 'active'),
  ('kb@allincapital.vc', 'admin', 'active'),
  ('aarjav@allincapital.vc', 'admin', 'active'),
  ('rs@allincapital.vc', 'admin', 'active')
ON CONFLICT (email) DO UPDATE
  SET role = EXCLUDED.role,
      status = 'active',
      updated_at = now();
