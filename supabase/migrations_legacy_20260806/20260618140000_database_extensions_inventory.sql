-- Inventory enabled Postgres extensions for ops/upgrade probes (read-only).
-- Supabase installs most extensions under the `extensions` schema; see Dashboard → Extensions.

CREATE OR REPLACE FUNCTION public.get_database_storage_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cron_rows bigint := NULL;
  pg_ver text := current_setting('server_version');
  pg_major int;
  deprecated text[] := ARRAY[]::text[];
  enabled jsonb := '[]'::jsonb;
BEGIN
  pg_major := (regexp_match(pg_ver, '^(\d+)'))[1]::int;

  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    BEGIN
      SELECT count(*)::bigint INTO cron_rows FROM cron.job_run_details;
    EXCEPTION WHEN OTHERS THEN
      cron_rows := NULL;
    END;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', e.extname,
        'schema', n.nspname,
        'version', e.extversion
      )
      ORDER BY e.extname
    ),
    '[]'::jsonb
  )
  INTO enabled
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname <> 'plpgsql';

  SELECT coalesce(array_agg(e.extname ORDER BY e.extname), ARRAY[]::text[])
  INTO deprecated
  FROM pg_extension e
  WHERE e.extname = ANY(ARRAY['pgjwt', 'timescaledb', 'plv8', 'plls', 'plcoffee']);

  RETURN jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'wal_bytes', COALESCE((SELECT sum(size) FROM pg_ls_waldir()), 0::bigint),
    'postgres_version', pg_ver,
    'postgres_major', pg_major,
    'cron_job_run_details_rows', cron_rows,
    'deprecated_extensions', to_jsonb(deprecated),
    'enabled_extensions', enabled
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_database_storage_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_database_storage_stats() TO service_role;
