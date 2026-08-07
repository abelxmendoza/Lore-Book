-- These tables are server-owned infrastructure. All current application
-- access goes through `supabaseAdmin`; there is no browser/client data path.
-- Keep them in `public` for compatibility, but remove Data API access for
-- anon/authenticated roles and enable RLS as defense in depth.

DO $hardening$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'api_rate_limit_buckets',
    'project_chronicle_milestones',
    'project_chronicle_pending_detections',
    'project_chronicle_meta'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      RAISE NOTICE 'harden_internal_tables_rls: %.% missing; skip', 'public', table_name;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      table_name
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role',
      table_name
    );
  END LOOP;

  -- The RPC mutates rate-limit state and must only be callable by the server.
  -- Pin the resolution path because the function is intentionally invoker-mode.
  IF to_regprocedure('public.check_api_rate_limit(text,integer,integer)') IS NOT NULL THEN
    ALTER FUNCTION public.check_api_rate_limit(text, integer, integer)
      SET search_path = pg_catalog, public;
    REVOKE EXECUTE ON FUNCTION public.check_api_rate_limit(text, integer, integer)
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.check_api_rate_limit(text, integer, integer)
      TO service_role;
  ELSE
    RAISE NOTICE 'harden_internal_tables_rls: check_api_rate_limit missing; skip';
  END IF;
END
$hardening$;
