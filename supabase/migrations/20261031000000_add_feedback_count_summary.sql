-- Issue #90: set-based, count-only Feedback summary for internal operators.
--
-- get_feedback_count_summary returns fixed count groups for submissions created
-- in a bounded window (start inclusive, end exclusive, at most 31 days). The
-- window bounds are UTC instants; the application derives them from Asia/Manila
-- calendar days. DAY buckets are Asia/Manila calendar dates.
-- It returns no message, notes, nonce, identity, or row identifier, and it
-- performs one aggregate scan instead of fetching rows into the application.
--
-- Service-role only. The operator UUID is passed by the server after
-- requireInternalOperator(); the enabled mapping is rechecked under FOR SHARE
-- so a concurrent revocation serializes against this read.

CREATE FUNCTION public.get_feedback_count_summary(
  p_operator_user_id UUID,
  p_window_start TIMESTAMPTZ,
  p_window_end TIMESTAMPTZ
)
RETURNS TABLE (
  dimension TEXT,
  bucket TEXT,
  row_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  IF p_operator_user_id IS NULL
    OR p_window_start IS NULL
    OR p_window_end IS NULL THEN
    RAISE EXCEPTION 'Operator and window are required';
  END IF;

  IF p_window_end <= p_window_start
    OR p_window_end - p_window_start > interval '31 days' THEN
    RAISE EXCEPTION 'FEEDBACK_SUMMARY_WINDOW_INVALID';
  END IF;

  SELECT io.enabled
  INTO v_enabled
  FROM public.internal_operators io
  WHERE io.user_id = p_operator_user_id
  FOR SHARE;

  IF v_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'Internal operator access required';
  END IF;

  RETURN QUERY
  WITH window_rows AS (
    SELECT fs.category, fs.source, fs.status, fs.created_at
    FROM public.feedback_submissions fs
    WHERE fs.created_at >= p_window_start
      AND fs.created_at < p_window_end
  )
  SELECT 'CATEGORY'::TEXT, wr.category, count(*)::BIGINT
  FROM window_rows wr
  GROUP BY wr.category
  UNION ALL
  SELECT 'SOURCE'::TEXT, wr.source, count(*)::BIGINT
  FROM window_rows wr
  GROUP BY wr.source
  UNION ALL
  SELECT 'STATUS'::TEXT, wr.status, count(*)::BIGINT
  FROM window_rows wr
  GROUP BY wr.status
  UNION ALL
  SELECT 'DAY'::TEXT,
         to_char((wr.created_at AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD'),
         count(*)::BIGINT
  FROM window_rows wr
  GROUP BY (wr.created_at AT TIME ZONE 'Asia/Manila')::date;
END;
$$;

COMMENT ON FUNCTION public.get_feedback_count_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Service-role-only count-only Feedback summary for a bounded window with Asia/Manila DAY buckets. STATUS is the current status snapshot. Returns fixed groups only, never row text or identifiers.';

REVOKE ALL ON FUNCTION public.get_feedback_count_summary(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_feedback_count_summary(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;
