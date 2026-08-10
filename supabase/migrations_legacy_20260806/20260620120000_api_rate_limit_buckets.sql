-- Free distributed rate-limit buckets (Supabase Postgres — no Redis).
-- Enable server-side with RATE_LIMIT_BACKEND=postgres

CREATE TABLE IF NOT EXISTS api_rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limit_expires
  ON api_rate_limit_buckets (expires_at);

-- Atomic check-and-increment. Returns allowed + retry_after_sec.
CREATE OR REPLACE FUNCTION check_api_rate_limit(
  p_bucket_key text,
  p_max integer,
  p_window_ms integer
)
RETURNS TABLE (allowed boolean, retry_after_sec integer)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz := now();
  v_window interval := (p_window_ms || ' milliseconds')::interval;
  v_expires timestamptz := v_now + v_window;
  v_count integer;
  v_reset timestamptz;
BEGIN
  DELETE FROM api_rate_limit_buckets WHERE expires_at < v_now;

  INSERT INTO api_rate_limit_buckets (bucket_key, window_start, count, expires_at)
  VALUES (p_bucket_key, v_now, 1, v_expires)
  ON CONFLICT (bucket_key) DO UPDATE
    SET
      count = CASE
        WHEN api_rate_limit_buckets.expires_at < v_now THEN 1
        ELSE api_rate_limit_buckets.count + 1
      END,
      window_start = CASE
        WHEN api_rate_limit_buckets.expires_at < v_now THEN v_now
        ELSE api_rate_limit_buckets.window_start
      END,
      expires_at = CASE
        WHEN api_rate_limit_buckets.expires_at < v_now THEN v_expires
        ELSE api_rate_limit_buckets.expires_at
      END
  RETURNING count, expires_at INTO v_count, v_reset;

  IF v_count > p_max THEN
    allowed := false;
    retry_after_sec := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_reset - v_now)))::integer);
    RETURN NEXT;
    RETURN;
  END IF;

  allowed := true;
  retry_after_sec := 0;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION check_api_rate_limit IS
  'Atomic API rate limit bucket — use with RATE_LIMIT_BACKEND=postgres on the server';
