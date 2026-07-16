-- Match in-memory rate-limit semantics: once a bucket is at/over max, further
-- checks must NOT increment the counter. The previous RPC always incremented
-- on conflict, which made denied traffic look like heavier abuse and complicated
-- ops/debugging. Window length is unchanged (expires_at stays put).

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

  -- Peek existing active bucket. If already at/over max, deny without bumping.
  SELECT count, expires_at
    INTO v_count, v_reset
    FROM api_rate_limit_buckets
   WHERE bucket_key = p_bucket_key
     AND expires_at >= v_now;

  IF FOUND AND v_count >= p_max THEN
    allowed := false;
    retry_after_sec := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_reset - v_now)))::integer);
    RETURN NEXT;
    RETURN;
  END IF;

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
  'Atomic API rate limit bucket — deny without incrementing when already at max';
