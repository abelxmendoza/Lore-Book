-- Lock down SECURITY DEFINER RPCs that PostgREST still exposes to anon /
-- authenticated. These functions run as the owner (bypass RLS). Passing
-- another user's UUID (or any event/character UUID) is an IDOR.
--
-- Application callers use supabaseAdmin (service_role). The frontend does
-- not call these RPCs. Event-trigger functions keep owner execution even
-- with no role grants.
--
-- Production ledger (applied 2026-08-20):
--   supabase_migrations.schema_migrations
--     version = 20260820003718
--     name    = revoke_anon_security_definer_rpcs
-- Originally authored as 20260819000000; filename retimestamped so the repo
-- is an exact match, not a same-name/different-timestamp alias.

DO $lockdown$
DECLARE
  proc_ident TEXT;
  proc_oid oid;
  ret_type regtype;
BEGIN
  FOREACH proc_ident IN ARRAY ARRAY[
    'public.apply_accessibility_decay(double precision,double precision)',
    'public.apply_arc_stability_decay(double precision,double precision)',
    'public.bump_arc_stability(uuid[])',
    'public.bump_retrieval_count(uuid[])',
    'public.get_characters_for_event(uuid)',
    'public.get_characters_for_location(uuid)',
    'public.get_database_storage_stats()',
    'public.get_events_for_character(uuid)',
    'public.get_locations_for_character(uuid)',
    'public.get_locations_for_event(uuid)',
    'public.get_or_create_usage(uuid,date)',
    'public.get_pending_mrq(uuid)',
    'public.get_perspective_claims_for_base(uuid)',
    'public.get_scope_by_type(text)',
    'public.get_timelines_for_character(uuid)',
    'public.get_timelines_for_event(uuid)',
    'public.get_timelines_for_location(uuid)',
    'public.rls_auto_enable()',
    'public.semantic_search_across_engines(vector,integer)',
    'public.update_engine_health_error(text,text)',
    'public.update_engine_health_success(text,integer)'
  ]
  LOOP
    proc_oid := to_regprocedure(proc_ident);
    IF proc_oid IS NULL THEN
      RAISE NOTICE 'revoke_anon_security_definer_rpcs: % missing; skip', proc_ident;
      CONTINUE;
    END IF;

    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      proc_ident
    );

    SELECT p.prorettype::regtype INTO ret_type
    FROM pg_proc p
    WHERE p.oid = proc_oid;

    IF ret_type IS DISTINCT FROM 'event_trigger'::regtype THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', proc_ident);
    END IF;
  END LOOP;

  IF to_regprocedure('public.get_pending_mrq(uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.get_pending_mrq(uuid)
      SET search_path = pg_catalog, public;
  END IF;
END
$lockdown$;
