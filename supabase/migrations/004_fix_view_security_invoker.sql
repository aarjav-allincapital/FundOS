-- Fix lint: Security Definer View on public.v_lot_current
-- Ensure the view uses querying-user permissions/RLS context.

ALTER VIEW IF EXISTS public.v_lot_current
SET (security_invoker = true);

