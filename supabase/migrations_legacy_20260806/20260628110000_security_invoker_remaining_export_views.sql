-- Resolve the remaining CRITICAL "Security Definer View" advisors (same class as
-- provenance_edges_export in the prior migration). Both views are accessed only
-- server-side via the service-role client (which bypasses RLS) or not at all, so
-- switching them to SECURITY INVOKER is safe and strictly more secure: they now
-- respect the caller's RLS instead of the view creator's elevated privileges.
alter view public.pipeline_runs_incomplete set (security_invoker = on);
alter view public.omega_claims_with_evidence set (security_invoker = on);
