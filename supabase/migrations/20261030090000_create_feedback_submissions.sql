-- Issue #89: private Feedback submission store and fixed submit receipt.
--
-- Submissions are private: no ordinary client role can read or write them, and
-- the only write path is the narrow service-role submit_feedback RPC. The
-- application derives the trusted participant class and source; PostgreSQL
-- repeats the domain constraints so no caller can bypass them.
--
-- Text is stored trimmed of ASCII edge whitespace (space, tab, LF, CR, FF, VT)
-- and bounded in PostgreSQL characters (char_length counts code points, not
-- bytes). Ordinary C0 control characters are rejected as plain-text violations.

CREATE TABLE public.feedback_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_nonce UUID NOT NULL UNIQUE,
  category TEXT NOT NULL,
  source TEXT NOT NULL,
  participant_class TEXT NOT NULL,
  title TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW',
  priority TEXT NOT NULL DEFAULT 'NORMAL',
  internal_notes TEXT,
  linked_issue_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users (id) ON DELETE RESTRICT,
  row_version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT feedback_submissions_category_check CHECK (
    category IN ('BUG', 'USABILITY', 'FEATURE_REQUEST', 'GENERAL')
  ),
  CONSTRAINT feedback_submissions_source_check CHECK (
    source IN ('PUBLIC_TRACKING', 'PUBLIC_REQUEST', 'PUBLIC_FEEDBACK', 'PROVIDER_WORKSPACE')
  ),
  CONSTRAINT feedback_submissions_participant_class_check CHECK (
    participant_class IN (
      'PUBLIC_SELF_REPORTED_CUSTOMER',
      'SHOP_OWNER',
      'SHOP_STAFF',
      'INDEPENDENT_REPAIRER'
    )
  ),
  CONSTRAINT feedback_submissions_source_class_pair_check CHECK (
    (
      source IN ('PUBLIC_TRACKING', 'PUBLIC_REQUEST', 'PUBLIC_FEEDBACK')
      AND participant_class = 'PUBLIC_SELF_REPORTED_CUSTOMER'
    )
    OR (
      source = 'PROVIDER_WORKSPACE'
      AND participant_class IN ('SHOP_OWNER', 'SHOP_STAFF', 'INDEPENDENT_REPAIRER')
    )
  ),
  CONSTRAINT feedback_submissions_title_check CHECK (
    title IS NULL
    OR (
      title = btrim(title, E' \t\n\r\f' || chr(11))
      AND char_length(title) BETWEEN 1 AND 120
      AND title !~ '[\x01-\x08\x0E-\x1F\x7F]'
    )
  ),
  CONSTRAINT feedback_submissions_message_check CHECK (
    message = btrim(message, E' \t\n\r\f' || chr(11))
    AND char_length(message) BETWEEN 1 AND 2000
    AND message !~ '[\x01-\x08\x0E-\x1F\x7F]'
  ),
  CONSTRAINT feedback_submissions_status_check CHECK (
    status IN ('NEW', 'REVIEWING', 'PLANNED', 'RESOLVED', 'DISMISSED')
  ),
  CONSTRAINT feedback_submissions_priority_check CHECK (
    priority IN ('NORMAL', 'HIGH', 'CRITICAL')
  ),
  CONSTRAINT feedback_submissions_internal_notes_check CHECK (
    internal_notes IS NULL
    OR (
      internal_notes = btrim(internal_notes, E' \t\n\r\f' || chr(11))
      AND char_length(internal_notes) BETWEEN 1 AND 2000
    )
  ),
  CONSTRAINT feedback_submissions_linked_issue_url_check CHECK (
    linked_issue_url IS NULL
    OR linked_issue_url ~ '^https://github\.com/Jacinth091/Tracknologia/issues/[1-9][0-9]*$'
  ),
  CONSTRAINT feedback_submissions_row_version_check CHECK (row_version > 0),
  CONSTRAINT feedback_submissions_review_stamp_check CHECK (
    (row_version = 1 AND reviewed_at IS NULL AND reviewed_by IS NULL)
    OR (row_version > 1 AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
  )
);

COMMENT ON TABLE public.feedback_submissions IS
  'Private submitted feedback. Original title/message/category/source/class are immutable after insert; only internal review fields change, each with a version bump and a per-feedback review event.';
COMMENT ON COLUMN public.feedback_submissions.submission_nonce IS
  'Client-generated retry key. Not an identity, lookup token, or authorization credential.';

CREATE INDEX feedback_submissions_created_at_idx
  ON public.feedback_submissions (created_at DESC, id DESC);
CREATE INDEX feedback_submissions_status_created_at_idx
  ON public.feedback_submissions (status, created_at DESC, id DESC);

CREATE TABLE public.feedback_review_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES public.feedback_submissions (id) ON DELETE RESTRICT,
  operator_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  priority_before TEXT NOT NULL,
  priority_after TEXT NOT NULL,
  row_version INTEGER NOT NULL,
  reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT feedback_review_events_from_status_check CHECK (
    from_status IN ('NEW', 'REVIEWING', 'PLANNED', 'RESOLVED', 'DISMISSED')
  ),
  CONSTRAINT feedback_review_events_to_status_check CHECK (
    to_status IN ('NEW', 'REVIEWING', 'PLANNED', 'RESOLVED', 'DISMISSED')
  ),
  CONSTRAINT feedback_review_events_priority_check CHECK (
    priority_before IN ('NORMAL', 'HIGH', 'CRITICAL')
    AND priority_after IN ('NORMAL', 'HIGH', 'CRITICAL')
  ),
  CONSTRAINT feedback_review_events_row_version_check CHECK (row_version > 1),
  CONSTRAINT feedback_review_events_reason_check CHECK (
    reason IS NULL
    OR (
      reason = btrim(reason, E' \t\n\r\f' || chr(11))
      AND char_length(reason) BETWEEN 3 AND 500
    )
  )
);

COMMENT ON TABLE public.feedback_review_events IS
  'Append-only per-feedback review history. Holds state and priority transitions and a bounded reason only; never duplicates submitted or internal note text. Referenced feedback and operators cannot be deleted while history exists.';

CREATE INDEX feedback_review_events_history_idx
  ON public.feedback_review_events (feedback_id, occurred_at, event_id);

ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_review_events ENABLE ROW LEVEL SECURITY;

-- No RLS policies are created: ordinary clients are denied by grants plus the
-- absence of policies. service_role receives SELECT only, so direct writes by
-- the privileged client cannot bypass the submit and review RPCs (and their
-- history). Supabase's default privileges would otherwise grant service_role
-- full table access, so it is revoked explicitly first.
REVOKE ALL ON TABLE public.feedback_submissions
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.feedback_review_events
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.feedback_submissions TO service_role;
GRANT SELECT ON TABLE public.feedback_review_events TO service_role;

-- Anonymous submission receipt. One INSERT with ON CONFLICT on the nonce:
-- a retry with the same nonce is a no-op that leaves the original row
-- untouched, and concurrent same-nonce calls serialize on the unique index.
-- Every caller gets the same generic receipt, so acceptance discloses nothing
-- about earlier content. CHECK constraints reject malformed values before any
-- conflict handling, so a malformed retry raises without mutating anything.
CREATE FUNCTION public.submit_feedback(
  p_submission_nonce UUID,
  p_category TEXT,
  p_source TEXT,
  p_participant_class TEXT,
  p_title TEXT,
  p_message TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.feedback_submissions (
    submission_nonce,
    category,
    source,
    participant_class,
    title,
    message
  )
  VALUES (
    p_submission_nonce,
    p_category,
    p_source,
    p_participant_class,
    nullif(btrim(p_title, E' \t\n\r\f' || chr(11)), ''),
    btrim(p_message, E' \t\n\r\f' || chr(11))
  )
  ON CONFLICT (submission_nonce) DO NOTHING;

  RETURN 'ACCEPTED';
END;
$$;

REVOKE ALL ON FUNCTION public.submit_feedback(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_feedback(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;
