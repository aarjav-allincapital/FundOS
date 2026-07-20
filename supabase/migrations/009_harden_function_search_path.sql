-- Security hardening: pin search_path on all SECURITY-relevant functions.
--
-- The Supabase linter (lint 0011_function_search_path_mutable) flags functions
-- whose search_path is role-mutable: a caller could prepend a malicious schema
-- and shadow the objects the function references. Pinning search_path to a
-- fixed value removes that vector. We use `public, pg_temp` (not empty) because
-- these function bodies reference public tables unqualified — an empty path
-- would break them. `pg_temp` is placed last so temp objects can never shadow
-- real ones.

alter function public.set_fund_code() set search_path = public, pg_temp;
alter function public.generate_lot_code() set search_path = public, pg_temp;
alter function public.touch_company_updated_at() set search_path = public, pg_temp;
alter function public.fan_out_valuation_snapshots(uuid) set search_path = public, pg_temp;
alter function public.generate_unique_abbr(text, uuid, uuid) set search_path = public, pg_temp;
alter function public.set_company_abbr() set search_path = public, pg_temp;
alter function public.set_valuation_event_code() set search_path = public, pg_temp;
alter function public.sync_company_valuation_cache() set search_path = public, pg_temp;
