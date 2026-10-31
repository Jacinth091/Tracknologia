-- Old-state fixture for scripts/rehearse-pending-migrations.sh.
--
-- Applied as the lab seed while only the BASE migration history is present, so
-- the pending-only upgrade must carry this data forward unchanged. Uses only
-- tables and columns that already exist in the earliest shared history (the
-- staging base predates #88 as well as the release baseline), and fixed IDs and
-- values so the database suite can assert exact unchanged snapshots
-- (tests/integration/feedback.db.test.ts, REHEARSAL_UPGRADE_FIXTURE=1). The
-- lab is local and disposable; this file is never used by `supabase db reset`
-- for the dev stack.

-- Owner identity required by repairs.created_by_user_id.
INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-4000-8000-00000000c001',
  'authenticated',
  'authenticated',
  'rehearsal-upgrade@example.test',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

INSERT INTO public.providers (id, display_name, slug)
VALUES (
  '00000000-0000-4000-8000-00000000d001',
  'Rehearsal Upgrade Provider',
  'rehearsal-upgrade-provider'
);

INSERT INTO public.repair_requests (
  id,
  provider_id,
  reference_code,
  customer_name,
  customer_phone,
  device_type,
  reported_problem
)
VALUES (
  '00000000-0000-4000-8000-00000000e001',
  '00000000-0000-4000-8000-00000000d001',
  'REQ-0123456789ABCDEF',
  'Rehearsal Customer',
  '+63 900 000 0001',
  'Laptop',
  'Rehearsal reported problem'
);

INSERT INTO public.repairs (
  id,
  provider_id,
  repair_request_id,
  origin,
  ticket_number,
  tracking_code,
  customer_name,
  customer_phone,
  device_type,
  reported_problem,
  created_by_user_id
)
VALUES (
  '00000000-0000-4000-8000-00000000f001',
  '00000000-0000-4000-8000-00000000d001',
  '00000000-0000-4000-8000-00000000e001',
  'CUSTOMER_REQUEST',
  'TN-2026-ABCDEF0123',
  'TRK-0123456789ABCDEF01234567',
  'Rehearsal Customer',
  '+63 900 000 0001',
  'Laptop',
  'Rehearsal reported problem',
  '00000000-0000-4000-8000-00000000c001'
);

-- Old abuse-control counters for both existing public operations.
INSERT INTO public.public_operation_rate_limits (
  operation,
  actor_key,
  window_started_at,
  expires_at,
  request_count
)
VALUES
  (
    'tracking_lookup',
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    now(),
    now() + interval '1 day',
    3
  ),
  (
    'repair_request_submit',
    'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
    now(),
    now() + interval '1 day',
    2
  );

-- Historic redaction for the privacy-review backfill (migration
-- 20261102000000_add_feedback_privacy_review_mark.sql). Seeded only while that
-- migration is pending: the privacy audit table exists and the
-- privacy_reviewed_at column does not. Otherwise the base has no Feedback
-- tables, or the column is already there, and nothing is seeded.
--
-- The redacted row mirrors the values the owner redaction runbook writes. Its
-- two FEEDBACK_REDACTED audit rows are inserted latest first, so the upgrade
-- must choose the earliest one. The control row has no audit row and must stay
-- null after the backfill.
DO $$
BEGIN
  IF to_regclass('public.feedback_privacy_audit') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'feedback_submissions'
         AND column_name = 'privacy_reviewed_at'
     ) THEN
    INSERT INTO public.feedback_submissions (
      id,
      submission_nonce,
      category,
      source,
      participant_class,
      title,
      message,
      status,
      priority,
      internal_notes,
      created_at,
      reviewed_at,
      reviewed_by,
      row_version
    )
    VALUES
      (
        '00000000-0000-4000-8000-00000000a001',
        '00000000-0000-4000-8000-00000000b001',
        'BUG',
        'PUBLIC_TRACKING',
        'PUBLIC_SELF_REPORTED_CUSTOMER',
        '[redacted]',
        '[redacted]',
        'NEW',
        'NORMAL',
        NULL,
        '2026-06-01T08:00:00Z',
        '2026-06-10T09:00:00Z',
        '00000000-0000-4000-8000-00000000c001',
        2
      ),
      (
        '00000000-0000-4000-8000-00000000a002',
        '00000000-0000-4000-8000-00000000b002',
        'USABILITY',
        'PUBLIC_TRACKING',
        'PUBLIC_SELF_REPORTED_CUSTOMER',
        'Rehearsal control',
        'Rehearsal control message',
        'NEW',
        'NORMAL',
        NULL,
        '2026-06-02T08:00:00Z',
        NULL,
        NULL,
        1
      );

    INSERT INTO public.feedback_privacy_audit (
      operation,
      target_feedback_id,
      actor_user_id,
      approval_ref,
      created_at
    )
    VALUES
      (
        'FEEDBACK_REDACTED',
        '00000000-0000-4000-8000-00000000a001',
        '00000000-0000-4000-8000-00000000c001',
        'ISSUE-92-REHEARSAL',
        '2026-06-12T09:00:00Z'
      ),
      (
        'FEEDBACK_REDACTED',
        '00000000-0000-4000-8000-00000000a001',
        '00000000-0000-4000-8000-00000000c001',
        'ISSUE-92-REHEARSAL',
        '2026-06-10T09:00:00Z'
      );
  END IF;
END $$;
