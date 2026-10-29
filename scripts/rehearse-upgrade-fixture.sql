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
