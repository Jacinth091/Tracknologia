-- Issue #92 / PR #105 review: dedicated append-only audit for owner-run
-- Feedback redaction and purge.
--
-- internal_access_audit stays access-only (view and grant/revoke events). A
-- privacy operation on participant feedback is not an access event, so it gets
-- its own fixed operation set and its own target reference. The target UUID
-- deliberately has no foreign key: a purged feedback row must not take its
-- audit evidence with it.
--
-- Rows are written only by the owner-run runbook in docs/OPERATIONS.md, inside
-- the same transaction as the redaction or purge it describes. No client role
-- can write here. A redaction bumps feedback_submissions.row_version without a
-- review event, so this audit is the record that explains the administrative
-- version change and invalidates pre-redaction triage forms. Retention of this
-- audit is part of the open issue #87 policy decision and is intentionally not
-- defined here.

CREATE TABLE public.feedback_privacy_audit (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation TEXT NOT NULL,
  target_feedback_id UUID NOT NULL,
  actor_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  approval_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT feedback_privacy_audit_operation_fixed CHECK (
    operation IN ('FEEDBACK_REDACTED', 'FEEDBACK_PURGED')
  ),
  CONSTRAINT feedback_privacy_audit_approval_ref_bounded CHECK (
    approval_ref ~ '^[A-Za-z0-9#._/:-]{3,80}$'
  )
);

COMMENT ON TABLE public.feedback_privacy_audit IS
  'Append-only audit of owner-run Feedback redaction and purge. Records the fixed operation, the target Feedback UUID (no foreign key, so it survives purge), the actor Auth user (nulled on Auth deletion), and a bounded non-PII approval reference. Never holds participant text.';
COMMENT ON COLUMN public.feedback_privacy_audit.approval_ref IS
  'Concise approval/ticket identifier (3-80 characters of letters, digits and #._/:-). Never names, emails, or free text.';

ALTER TABLE public.feedback_privacy_audit ENABLE ROW LEVEL SECURITY;

-- No RLS policies: ordinary clients are denied by grants plus the absence of
-- policies. Supabase's default privileges would grant service_role full table
-- access, so it is revoked explicitly before receiving SELECT only.
REVOKE ALL ON TABLE public.feedback_privacy_audit
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.feedback_privacy_audit TO service_role;
