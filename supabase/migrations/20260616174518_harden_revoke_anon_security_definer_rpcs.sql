-- Mirrored from supabase_migrations.schema_migrations (version 20260616174518).
-- Applied on remote before this file existed in the repo.

-- P0 security: these SECURITY DEFINER functions were executable by anon/authenticated
-- via /rest/v1/rpc and bypass RLS. No app code calls them via .rpc() (verified).
-- Revoke EXECUTE from the API roles; service-role and trigger-internal calls are unaffected.
REVOKE EXECUTE ON FUNCTION public.can_reverse_event(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_event_explanation(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_accepted_latest_terms(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.initialize_free_subscription() FROM anon, authenticated;
