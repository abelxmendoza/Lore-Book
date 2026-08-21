-- These three views already run as SECURITY INVOKER (caller's RLS).
-- They are still GRANT ALL to anon/authenticated, so the Data API can
-- reach them. Every current reader uses supabaseAdmin (service_role).
--
-- epiphany_insights INSERT policy WITH CHECK (true) targeted PUBLIC, so
-- any role with INSERT (including anon) could write arbitrary rows.
-- Inserts go through supabaseAdmin; drop the open policy.

DO $harden$
DECLARE
  view_name TEXT;
BEGIN
  FOREACH view_name IN ARRAY ARRAY[
    'omega_claims_with_evidence',
    'pipeline_runs_incomplete',
    'provenance_edges_export'
  ]
  LOOP
    IF to_regclass(format('public.%I', view_name)) IS NULL THEN
      RAISE NOTICE 'harden_export_views: public.% missing; skip', view_name;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', view_name);
    EXECUTE format(
      'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      view_name
    );
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', view_name);
  END LOOP;

  IF to_regclass('public.epiphany_insights') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Service role can insert epiphany insights"
      ON public.epiphany_insights;
    REVOKE ALL ON TABLE public.epiphany_insights FROM PUBLIC, anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.epiphany_insights TO service_role;
  ELSE
    RAISE NOTICE 'harden_export_views: public.epiphany_insights missing; skip';
  END IF;
END
$harden$;
