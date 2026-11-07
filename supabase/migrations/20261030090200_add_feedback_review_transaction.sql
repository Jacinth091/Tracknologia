-- Issue #89: atomic, operator-bound, versioned Feedback review.
--
-- record_feedback_review is the only mutation path for internal review fields.
-- It is service-role only: the operator UUID is resolved server-side from the
-- verified internal session (#88), never taken from browser input.
--
-- Lock order is fixed: the operator mapping is locked (FOR SHARE, so a concurrent
-- revocation, which takes FOR UPDATE, serializes against it) before the feedback
-- row (FOR UPDATE). A review either commits its row update and its history event
-- together, or rolls both back.
--
-- Transition rules: any state may repeat its own status as an edit (version and
-- history still advance). Allowed changes are NEW -> REVIEWING|DISMISSED,
-- REVIEWING -> PLANNED|RESOLVED|DISMISSED, PLANNED -> RESOLVED|REVIEWING|DISMISSED,
-- and RESOLVED|DISMISSED -> REVIEWING, which requires a reason.
--
-- Original title, message, category, source, and participant class are never
-- written here. Internal review text is not copied into history.

CREATE FUNCTION public.record_feedback_review(
  p_feedback_id UUID,
  p_operator_user_id UUID,
  p_expected_row_version INTEGER,
  p_target_status TEXT,
  p_target_priority TEXT,
  p_internal_notes TEXT,
  p_linked_issue_url TEXT,
  p_reason TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_current public.feedback_submissions%ROWTYPE;
  v_reason TEXT;
  v_next_version INTEGER;
BEGIN
  IF p_feedback_id IS NULL
    OR p_operator_user_id IS NULL
    OR p_expected_row_version IS NULL
    OR p_target_status IS NULL
    OR p_target_priority IS NULL THEN
    RAISE EXCEPTION 'Feedback, operator, expected version, status, and priority are required';
  END IF;

  SELECT io.enabled
  INTO v_enabled
  FROM public.internal_operators io
  WHERE io.user_id = p_operator_user_id
  FOR SHARE;

  IF v_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'Internal operator access required';
  END IF;

  SELECT *
  INTO v_current
  FROM public.feedback_submissions fs
  WHERE fs.id = p_feedback_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FEEDBACK_NOT_FOUND';
  END IF;

  IF v_current.row_version <> p_expected_row_version THEN
    RAISE EXCEPTION 'FEEDBACK_VERSION_CONFLICT';
  END IF;

  v_reason := nullif(btrim(coalesce(p_reason, ''), E' \t\n\r\f' || chr(11)), '');

  IF v_reason IS NULL
    AND p_target_status = 'REVIEWING'
    AND v_current.status IN ('RESOLVED', 'DISMISSED') THEN
    RAISE EXCEPTION 'FEEDBACK_REASON_REQUIRED';
  END IF;

  IF NOT (
    v_current.status = p_target_status
    OR (v_current.status, p_target_status) IN (
      ('NEW', 'REVIEWING'),
      ('NEW', 'DISMISSED'),
      ('REVIEWING', 'PLANNED'),
      ('REVIEWING', 'RESOLVED'),
      ('REVIEWING', 'DISMISSED'),
      ('PLANNED', 'RESOLVED'),
      ('PLANNED', 'REVIEWING'),
      ('PLANNED', 'DISMISSED'),
      ('RESOLVED', 'REVIEWING'),
      ('DISMISSED', 'REVIEWING')
    )
  ) THEN
    RAISE EXCEPTION 'FEEDBACK_INVALID_TRANSITION';
  END IF;

  UPDATE public.feedback_submissions fs
  SET status = p_target_status,
      priority = p_target_priority,
      internal_notes = nullif(btrim(coalesce(p_internal_notes, ''), E' \t\n\r\f' || chr(11)), ''),
      linked_issue_url = nullif(btrim(coalesce(p_linked_issue_url, ''), E' \t\n\r\f' || chr(11)), ''),
      reviewed_at = now(),
      reviewed_by = p_operator_user_id,
      row_version = fs.row_version + 1
  WHERE fs.id = p_feedback_id
  RETURNING fs.row_version INTO v_next_version;

  INSERT INTO public.feedback_review_events (
    feedback_id,
    operator_user_id,
    from_status,
    to_status,
    priority_before,
    priority_after,
    row_version,
    reason
  )
  VALUES (
    p_feedback_id,
    p_operator_user_id,
    v_current.status,
    p_target_status,
    v_current.priority,
    p_target_priority,
    v_next_version,
    v_reason
  );

  RETURN v_next_version;
END;
$$;

REVOKE ALL ON FUNCTION public.record_feedback_review(
  UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_feedback_review(
  UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;
