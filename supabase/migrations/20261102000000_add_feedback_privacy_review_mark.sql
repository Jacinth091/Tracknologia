-- Issue #108 / PR #112 governed review REQ-01: a durable privacy-review mark on
-- Feedback, so the 90-day due queue can exclude items whose privacy review is
-- complete. Forward-only: no existing migration is edited, and no grant changes.
--
-- The column is set only by the owner-run runbooks in docs/OPERATIONS.md (the
-- redaction block and "Mark privacy review done (kept)"), each in the same
-- transaction as its privacy audit row. No client role can write it.
--
-- Checked before writing: no trigger or other UPDATE guard exists on
-- feedback_submissions (the only triggers in supabase/migrations belong to other
-- tables), and the owner-run runbooks already update it as the table owner. So
-- no trigger adjustment is needed for an owner-run update of this column.

ALTER TABLE public.feedback_submissions
  ADD COLUMN privacy_reviewed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.feedback_submissions.privacy_reviewed_at IS
  'When an owner-run privacy review completed for this submission, by redaction or by the "privacy review done (kept)" runbook. Set only by those runbooks, never by triage or a client role. Null means privacy review is still pending.';

ALTER TABLE public.feedback_privacy_audit
  DROP CONSTRAINT feedback_privacy_audit_operation_fixed;

ALTER TABLE public.feedback_privacy_audit
  ADD CONSTRAINT feedback_privacy_audit_operation_fixed CHECK (
    operation IN (
      'FEEDBACK_REDACTED',
      'FEEDBACK_PURGED',
      'FEEDBACK_PRIVACY_REVIEWED'
    )
  );

-- A submission redacted before this migration counts as privacy-reviewed from
-- its earliest redaction. Purged submissions no longer exist, so none are touched.
UPDATE public.feedback_submissions AS f
SET privacy_reviewed_at = first_redaction.occurred_at
FROM (
  SELECT target_feedback_id, min(created_at) AS occurred_at
  FROM public.feedback_privacy_audit
  WHERE operation = 'FEEDBACK_REDACTED'
  GROUP BY target_feedback_id
) AS first_redaction
WHERE f.id = first_redaction.target_feedback_id;
