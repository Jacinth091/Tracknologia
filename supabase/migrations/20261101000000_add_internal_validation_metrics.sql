-- Issue #93: set-based, count-only validation metrics from the authoritative
-- domain tables for internal operators.
--
-- get_internal_validation_metrics returns fixed count groups for a bounded
-- window (start inclusive, end exclusive, at most 90 Asia/Manila days). Window
-- bounds are UTC instants derived by the application from Asia/Manila calendar
-- days; DAY and repeat-activity buckets are Asia/Manila calendar dates.
--
-- It returns no row identifiers, no text, and no Provider series: a provider
-- id may only enter a COUNT or DISTINCT grouping inside the function. Requests
-- measures use the submission cohort (submitted inside the window,
-- regardless of when the decision landed); decision-period measures use the
-- decision timestamps inside the window. The application combines these rows into its
-- typed output and computes the ratios so empty denominators become explicit
-- N/A labels instead of zero.

CREATE FUNCTION public.get_internal_validation_metrics(
  p_operator_user_id UUID,
  p_window_start TIMESTAMPTZ,
  p_window_end TIMESTAMPTZ
)
RETURNS TABLE (
  dimension TEXT,
  bucket TEXT,
  row_count BIGINT,
  interval_seconds NUMERIC,
  as_of TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_as_of TIMESTAMPTZ;
BEGIN
  IF p_operator_user_id IS NULL
    OR p_window_start IS NULL
    OR p_window_end IS NULL THEN
    RAISE EXCEPTION 'Operator and window are required';
  END IF;

  IF NOT isfinite(p_window_start) OR NOT isfinite(p_window_end)
    OR (p_window_start AT TIME ZONE 'Asia/Manila')::time <> time '00:00'
    OR (p_window_end AT TIME ZONE 'Asia/Manila')::time <> time '00:00'
    OR p_window_end <= p_window_start
    OR p_window_end - p_window_start > interval '90 days' THEN
    RAISE EXCEPTION 'METRICS_WINDOW_INVALID';
  END IF;

  SELECT io.enabled
  INTO v_enabled
  FROM public.internal_operators io
  WHERE io.user_id = p_operator_user_id
  FOR SHARE;

  IF v_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'Internal operator access required';
  END IF;

  -- Capture the read time after any wait for a concurrent operator change.
  v_as_of := clock_timestamp();
  IF p_window_start >= v_as_of
    OR p_window_end > (((v_as_of AT TIME ZONE 'Asia/Manila')::date + 1)::timestamp AT TIME ZONE 'Asia/Manila') THEN
    RAISE EXCEPTION 'METRICS_WINDOW_INVALID';
  END IF;

  RETURN QUERY
  WITH window_bounds AS (
    SELECT p_window_start AS window_start, least(p_window_end, v_as_of) AS window_end
  ),
  repair_activity AS (
    SELECT r.provider_id,
           (r.created_at AT TIME ZONE 'Asia/Manila')::date AS activity_day
    FROM public.repairs r, window_bounds wb
    WHERE r.created_at >= wb.window_start AND r.created_at < wb.window_end
    UNION ALL
    SELECT r.provider_id,
           (se.created_at AT TIME ZONE 'Asia/Manila')::date AS activity_day
    FROM public.repair_status_events se
      JOIN public.repairs r ON r.id = se.repair_id,
      window_bounds wb
    WHERE se.from_status IS NOT NULL
      AND se.created_at >= wb.window_start
      AND se.created_at < wb.window_end
    UNION ALL
    SELECT r.provider_id,
           (u.created_at AT TIME ZONE 'Asia/Manila')::date AS activity_day
    FROM public.repair_updates u
      JOIN public.repairs r ON r.id = u.repair_id,
      window_bounds wb
    WHERE u.created_at >= wb.window_start
      AND u.created_at < wb.window_end
    UNION ALL
    SELECT rr.provider_id,
           ((COALESCE(rr.accepted_at, rr.declined_at)) AT TIME ZONE 'Asia/Manila')::date
            AS activity_day
    FROM public.repair_requests rr, window_bounds wb
    WHERE COALESCE(rr.accepted_at, rr.declined_at) IS NOT NULL
      AND COALESCE(rr.accepted_at, rr.declined_at) >= wb.window_start
      AND COALESCE(rr.accepted_at, rr.declined_at) < wb.window_end
  ),
  active_activity AS (
    SELECT provider_id, activity_day FROM repair_activity
    GROUP BY provider_id, activity_day
  )
  , counts (dimension, bucket, row_count, interval_seconds) AS (
  -- Providers onboarded inside the window, by type.
  SELECT 'PROVIDER_ONBOARDED_IN_PERIOD'::TEXT, p.provider_type::TEXT,
         count(*)::BIGINT, NULL::NUMERIC
  FROM public.providers p, window_bounds wb
  WHERE p.created_at >= wb.window_start AND p.created_at < wb.window_end
  GROUP BY p.provider_type

  UNION ALL
  -- All-time onboarding by type, and its total, for parity between windows.
  SELECT 'PROVIDER_ONBOARDED_ALL_TIME'::TEXT, p.provider_type::TEXT,
         count(*)::BIGINT, NULL::NUMERIC
  FROM public.providers p
  WHERE p.created_at < v_as_of
  GROUP BY p.provider_type

  UNION ALL
  SELECT 'PROVIDER_ONBOARDED_ALL_TIME'::TEXT, 'TOTAL'::TEXT,
         count(*)::BIGINT, NULL::NUMERIC
  FROM public.providers p
  WHERE p.created_at < v_as_of

  UNION ALL
  -- Providers doing real work inside the window.
  SELECT 'ACTIVE_PROVIDER_IN_PERIOD'::TEXT, 'TOTAL'::TEXT,
         count(DISTINCT aa.provider_id)::BIGINT, NULL::NUMERIC
  FROM active_activity aa

  UNION ALL
  -- Repeat activity: providers active on at least two distinct Manila days.
  SELECT 'ACTIVE_PROVIDER_IN_PERIOD'::TEXT, 'REPEAT'::TEXT,
         count(*)::BIGINT, NULL::NUMERIC
  FROM (
    SELECT aa.provider_id
    FROM active_activity aa
    GROUP BY aa.provider_id
    HAVING count(DISTINCT aa.activity_day) >= 2
  ) repeaters

  UNION ALL
  -- Daily series: distinct active providers per Asia/Manila calendar day.
  SELECT 'ACTIVE_DAY'::TEXT,
         to_char(aa.activity_day, 'YYYY-MM-DD'),
         count(*)::BIGINT, NULL::NUMERIC
  FROM active_activity aa
  GROUP BY aa.activity_day

  UNION ALL
  -- Staff footprint snapshots.
  SELECT 'STAFF_MEMBERSHIP_ACTIVE'::TEXT, 'TOTAL'::TEXT,
         count(*)::BIGINT, NULL::NUMERIC
  FROM public.provider_memberships m
  WHERE m.role = 'STAFF' AND m.created_at < v_as_of

  UNION ALL
  SELECT 'SHOP_WITH_STAFF'::TEXT, 'TOTAL'::TEXT,
         count(DISTINCT m.provider_id)::BIGINT, NULL::NUMERIC
  FROM public.provider_memberships m
  WHERE m.role = 'STAFF' AND m.created_at < v_as_of

  UNION ALL
  -- Current Repair statuses (snapshot as now).
  SELECT 'REPAIR_STATUS_NOW'::TEXT, r.current_status::TEXT,
         count(*)::BIGINT, NULL::NUMERIC
  FROM public.repairs r
  WHERE r.created_at < v_as_of
  GROUP BY r.current_status

  UNION ALL
  -- Repairs created inside the window, with the origin split.
  SELECT 'REPAIR_CREATED_IN_PERIOD'::TEXT,
         r.origin::TEXT, count(*)::BIGINT, NULL::NUMERIC
  FROM public.repairs r, window_bounds wb
  WHERE r.created_at >= wb.window_start AND r.created_at < wb.window_end
  GROUP BY r.origin

  UNION ALL
  SELECT 'REPAIR_CREATED_IN_PERIOD'::TEXT, 'TOTAL'::TEXT,
         count(*)::BIGINT, NULL::NUMERIC
  FROM public.repairs r, window_bounds wb
  WHERE r.created_at >= wb.window_start AND r.created_at < wb.window_end

  UNION ALL
  -- Workflow completion inside the window.
  SELECT 'REPAIR_COMPLETED_IN_PERIOD'::TEXT, 'TOTAL'::TEXT,
         count(*)::BIGINT, NULL::NUMERIC
  FROM public.repairs r, window_bounds wb
  WHERE r.completed_at IS NOT NULL
    AND r.completed_at >= wb.window_start
    AND r.completed_at < wb.window_end

  UNION ALL
  -- READY transitions and status-maintenance adoption inside the window.
  SELECT 'READY_REACHED_IN_PERIOD'::TEXT, 'TOTAL'::TEXT,
         count(DISTINCT se.repair_id)::BIGINT, NULL::NUMERIC
  FROM public.repair_status_events se, window_bounds wb
  WHERE se.to_status = 'READY'
    AND se.created_at >= wb.window_start
    AND se.created_at < wb.window_end

  UNION ALL
  SELECT 'STATUS_MAINTAINED_IN_PERIOD'::TEXT, 'TOTAL'::TEXT,
         count(DISTINCT se.repair_id)::BIGINT, NULL::NUMERIC
  FROM public.repair_status_events se, window_bounds wb
  WHERE se.from_status IS NOT NULL
    AND se.created_at >= wb.window_start
    AND se.created_at < wb.window_end

  UNION ALL
  -- Request intake inside the window.
  SELECT 'REQUEST_RECEIVED_IN_PERIOD'::TEXT, 'TOTAL'::TEXT,
         count(*)::BIGINT, NULL::NUMERIC
  FROM public.repair_requests rr, window_bounds wb
  WHERE rr.submitted_at >= wb.window_start
    AND rr.submitted_at < wb.window_end

  UNION ALL
  -- Request decisions inside the window (period semantics, not the cohort).
  SELECT 'REQUEST_DECIDED_IN_PERIOD'::TEXT, 'TOTAL'::TEXT,
         count(*)::BIGINT, NULL::NUMERIC
  FROM public.repair_requests rr, window_bounds wb
  WHERE ((rr.accepted_at IS NOT NULL
      AND rr.accepted_at >= wb.window_start AND rr.accepted_at < wb.window_end)
    OR (rr.declined_at IS NOT NULL
      AND rr.declined_at >= wb.window_start AND rr.declined_at < wb.window_end))

  UNION ALL
  SELECT 'REQUEST_DECIDED_IN_PERIOD'::TEXT, 'ACCEPTED'::TEXT,
         count(*)::BIGINT, NULL::NUMERIC
  FROM public.repair_requests rr, window_bounds wb
  WHERE rr.accepted_at IS NOT NULL
    AND rr.accepted_at >= wb.window_start
    AND rr.accepted_at < wb.window_end

  UNION ALL
  SELECT 'REQUEST_DECIDED_IN_PERIOD'::TEXT, 'DECLINED'::TEXT,
         count(*)::BIGINT, NULL::NUMERIC
  FROM public.repair_requests rr, window_bounds wb
  WHERE rr.declined_at IS NOT NULL
    AND rr.declined_at >= wb.window_start
    AND rr.declined_at < wb.window_end

  UNION ALL
  -- Pending Request snapshot (submitted, not yet decided).
  SELECT 'REQUEST_PENDING_NOW'::TEXT, 'TOTAL'::TEXT,
         count(*)::BIGINT, NULL::NUMERIC
  FROM public.repair_requests rr
  WHERE rr.status = 'SUBMITTED' AND rr.submitted_at < v_as_of

  UNION ALL
  -- Submission-cohort rows: cohort membership never shifts when a later
  -- decision lands, so the conversion keeps its definition over time.
  SELECT 'REQUEST_COHORT_IN_PERIOD'::TEXT, 'RECEIVED'::TEXT,
         count(*)::BIGINT, NULL::NUMERIC
  FROM public.repair_requests rr, window_bounds wb
  WHERE rr.submitted_at >= wb.window_start
    AND rr.submitted_at < wb.window_end

  UNION ALL
  SELECT 'REQUEST_COHORT_IN_PERIOD'::TEXT, 'ACCEPTED'::TEXT,
         count(*)::BIGINT, NULL::NUMERIC
  FROM public.repair_requests rr, window_bounds wb
  WHERE rr.submitted_at >= wb.window_start
    AND rr.submitted_at < wb.window_end
    AND rr.accepted_at IS NOT NULL
    AND rr.accepted_at < v_as_of

  UNION ALL
  -- Mean submitted-to-decision seconds over decisions made inside the window.
  SELECT 'REQUEST_DECISION_SECONDS'::TEXT, 'MEAN'::TEXT,
         count(*)::BIGINT,
         avg(EXTRACT(EPOCH FROM
           (COALESCE(rr.accepted_at, rr.declined_at) - rr.submitted_at)))::NUMERIC
  FROM public.repair_requests rr, window_bounds wb
  WHERE (COALESCE(rr.accepted_at, rr.declined_at)) IS NOT NULL
    AND COALESCE(rr.accepted_at, rr.declined_at) >= wb.window_start
    AND COALESCE(rr.accepted_at, rr.declined_at) < wb.window_end

  UNION ALL
  -- Tracking observations inside the window (views repeat; repairs do not).
  SELECT 'TRACKING_VIEWS_IN_PERIOD'::TEXT, 'TOTAL'::TEXT,
         count(*)::BIGINT, NULL::NUMERIC
  FROM public.tracking_events te, window_bounds wb
  WHERE te.viewed_at >= wb.window_start AND te.viewed_at < wb.window_end

  UNION ALL
  SELECT 'TRACKING_VIEWS_IN_PERIOD'::TEXT, 'REPAIRS'::TEXT,
         count(DISTINCT te.repair_id)::BIGINT, NULL::NUMERIC
  FROM public.tracking_events te, window_bounds wb
  WHERE te.viewed_at >= wb.window_start AND te.viewed_at < wb.window_end

  UNION ALL
  SELECT 'TRACKING_ALL_TIME'::TEXT, 'TOTAL'::TEXT,
         count(*)::BIGINT, NULL::NUMERIC
  FROM public.tracking_events te
  WHERE te.viewed_at < v_as_of

  UNION ALL
  SELECT 'TRACKING_ALL_TIME'::TEXT, 'REPAIRS'::TEXT,
         count(DISTINCT te.repair_id)::BIGINT, NULL::NUMERIC
  FROM public.tracking_events te
  WHERE te.viewed_at < v_as_of

  UNION ALL
  -- All-time Repairs: the adoption denominator (every Repair holds a code).
  SELECT 'REPAIR_ALL_TIME'::TEXT, 'TOTAL'::TEXT,
         count(*)::BIGINT, NULL::NUMERIC
  FROM public.repairs r
  WHERE r.created_at < v_as_of
  )
  SELECT c.dimension, c.bucket, c.row_count, c.interval_seconds, v_as_of
  FROM counts c;
END;
$$;

COMMENT ON FUNCTION public.get_internal_validation_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Service-role-only, count-only validation metrics over authoritative tables for a bounded window (at most 90 Asia/Manila days). Daily and repeat-activity buckets are Asia/Manila calendar days; REQUEST_*_IN_PERIOD rows use decision timestamps in the window while REQUEST_COHORT rows use the submission cohort. Returns fixed dimension/bucket/count groups, one mean-decision-seconds figure and a common database-generated as_of; period observations are capped at that read time; never identifiers, series by provider, or text.';

REVOKE ALL ON FUNCTION public.get_internal_validation_metrics(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_internal_validation_metrics(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;
