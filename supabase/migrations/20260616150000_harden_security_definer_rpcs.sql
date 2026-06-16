-- P0 security hardening: 4 SECURITY DEFINER functions were executable by anon/
-- authenticated via /rest/v1/rpc and bypass RLS (cross-user read/write surface).
-- No app code calls them via .rpc() (verified). Revoke the default PUBLIC grant
-- (anon/authenticated inherit EXECUTE through PUBLIC) so the API roles lose access.
-- Triggers run as the function owner and are unaffected.
REVOKE EXECUTE ON FUNCTION public.can_reverse_event(uuid)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_event_explanation(uuid)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_accepted_latest_terms(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.initialize_free_subscription()     FROM PUBLIC, anon, authenticated;
