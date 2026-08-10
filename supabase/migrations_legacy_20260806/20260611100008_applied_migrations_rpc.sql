-- Expose applied migration history to the drift-check script.
-- supabase_migrations schema is not reachable through PostgREST, so this
-- SECURITY DEFINER function bridges it. Service-role only.

CREATE OR REPLACE FUNCTION public.applied_migrations()
RETURNS TABLE(version text, name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT version::text, name::text
  FROM supabase_migrations.schema_migrations
  ORDER BY version;
$$;

REVOKE ALL ON FUNCTION public.applied_migrations() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.applied_migrations() TO service_role;
