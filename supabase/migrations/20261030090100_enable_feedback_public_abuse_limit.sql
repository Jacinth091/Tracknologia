-- Issue #89: add the feedback_submit operation to the durable abuse limiter.
--
-- Forward-only extension of 20260826120000_add_durable_public_abuse_control.sql,
-- which remains unchanged. Only the operation allow-list changes: the table
-- CHECK and the function guard now accept feedback_submit alongside the two
-- existing operations. Signature, atomic UPSERT, bounded cleanup, actor-key
-- validation, and grants are preserved. CREATE OR REPLACE keeps the function's
-- existing privileges, and the explicit REVOKE/GRANT below restates them.

ALTER TABLE public.public_operation_rate_limits
  DROP CONSTRAINT public_operation_rate_limits_operation_check;

ALTER TABLE public.public_operation_rate_limits
  ADD CONSTRAINT public_operation_rate_limits_operation_check CHECK (
    operation IN ('tracking_lookup', 'repair_request_submit', 'feedback_submit')
  );

CREATE OR REPLACE FUNCTION public.check_public_operation_rate_limit(
  p_operation TEXT,
  p_actor_key TEXT,
  p_window_seconds INTEGER,
  p_max_requests INTEGER,
  p_cleanup_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  allowed BOOLEAN,
  retry_after_seconds INTEGER,
  request_count INTEGER,
  window_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_count INTEGER;
  v_expires_at TIMESTAMPTZ;
BEGIN
  IF p_operation NOT IN (
    'tracking_lookup',
    'repair_request_submit',
    'feedback_submit'
  ) THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_OPERATION';
  END IF;
  IF p_actor_key IS NULL OR p_actor_key !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_ACTOR_KEY';
  END IF;
  IF p_window_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_WINDOW';
  END IF;
  IF p_max_requests NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_THRESHOLD';
  END IF;
  IF p_cleanup_limit NOT BETWEEN 0 AND 1000 THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_CLEANUP_LIMIT';
  END IF;

  IF p_cleanup_limit > 0 THEN
    DELETE FROM public.public_operation_rate_limits AS stale
    WHERE stale.ctid IN (
      SELECT candidate.ctid
      FROM public.public_operation_rate_limits AS candidate
      WHERE candidate.expires_at <= v_now
      ORDER BY candidate.expires_at
      LIMIT p_cleanup_limit
    );
  END IF;

  INSERT INTO public.public_operation_rate_limits AS limits (
    operation,
    actor_key,
    window_started_at,
    expires_at,
    request_count
  ) VALUES (
    p_operation,
    p_actor_key,
    v_now,
    v_now + make_interval(secs => p_window_seconds),
    1
  )
  ON CONFLICT (operation, actor_key) DO UPDATE SET
    window_started_at = CASE
      WHEN limits.expires_at <= v_now THEN v_now
      ELSE limits.window_started_at
    END,
    expires_at = CASE
      WHEN limits.expires_at <= v_now
        THEN v_now + make_interval(secs => p_window_seconds)
      ELSE limits.expires_at
    END,
    request_count = CASE
      WHEN limits.expires_at <= v_now THEN 1
      ELSE limits.request_count + 1
    END
  RETURNING limits.request_count, limits.expires_at
  INTO v_count, v_expires_at;

  RETURN QUERY SELECT
    v_count <= p_max_requests,
    CASE
      WHEN v_count <= p_max_requests THEN 0
      ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_expires_at - v_now)))::INTEGER)
    END,
    v_count,
    v_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.check_public_operation_rate_limit(
  TEXT, TEXT, INTEGER, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_public_operation_rate_limit(
  TEXT, TEXT, INTEGER, INTEGER, INTEGER
) TO service_role;
