-- Mirrored from supabase_migrations.schema_migrations (version 20260616174704).
-- Applied on remote before this file existed in the repo.

-- The previous revoke missed the default PUBLIC grant (anon/authenticated inherit
-- EXECUTE via PUBLIC). Revoke from PUBLIC to actually close access. Triggers run
-- as the function owner and are unaffected; no app .rpc() callers exist.
REVOKE EXECUTE ON FUNCTION public.can_reverse_event(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_event_explanation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_accepted_latest_terms(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.initialize_free_subscription() FROM PUBLIC, anon, authenticated;
