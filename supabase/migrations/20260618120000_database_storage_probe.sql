-- Read-only storage stats for health probes (service role only).
-- Matches Supabase database-size docs: pg_database_size + optional WAL footprint.

CREATE OR REPLACE FUNCTION public.get_database_storage_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'wal_bytes', COALESCE((SELECT sum(size) FROM pg_ls_waldir()), 0::bigint)
  );
$$;

REVOKE ALL ON FUNCTION public.get_database_storage_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_database_storage_stats() TO service_role;
