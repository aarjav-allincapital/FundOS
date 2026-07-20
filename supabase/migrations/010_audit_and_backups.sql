-- Audit trail + automatic pre-write backups.
--
-- Context: every save to /api/state is a full delete+replace of the relational
-- tables (see supabase-tables.ts writeAllTables). That design previously let a
-- failed-read-treated-as-empty bug wipe the whole portfolio with no way to
-- recover. These tables give us (a) a record of who wrote what and when, and
-- (b) an automatic snapshot taken immediately before every replace, so a bad
-- write can always be rolled back from the admin dashboard.
--
-- Neither table gets a public RLS policy — RLS is enabled with zero policies,
-- so only the service-role key (used server-side in /api/admin/* and
-- /api/state) can read or write them. Anon/authenticated clients are denied.

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_email text,
  action text not null,
  status text not null default 'ok', -- ok | blocked | denied | error
  before_counts jsonb,
  after_counts jsonb,
  details text
);

create index if not exists audit_log_created_at_idx on audit_log (created_at desc);
create index if not exists audit_log_action_idx on audit_log (action);

alter table audit_log enable row level security;

create table if not exists state_backups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reason text not null, -- pre-write-auto | manual | pre-restore
  actor_email text,
  counts jsonb,
  snapshot jsonb not null
);

create index if not exists state_backups_created_at_idx on state_backups (created_at desc);

alter table state_backups enable row level security;
