-- Old-state fixture for scripts/rehearse-pending-migrations.sh.
--
-- Applied as the lab seed while only the BASE migration history is present, so
-- the pending-only upgrade must carry this data forward unchanged. The database
-- suite verifies it when REHEARSAL_UPGRADE_FIXTURE=1
-- (tests/integration/feedback.db.test.ts). Fresh `supabase db reset` does not
-- use this file.

INSERT INTO public.public_operation_rate_limits (
  operation,
  actor_key,
  window_started_at,
  expires_at,
  request_count
)
VALUES (
  'tracking_lookup',
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  now(),
  now() + interval '1 day',
  3
);

INSERT INTO public.providers (display_name, slug)
VALUES ('Rehearsal Upgrade Provider', 'rehearsal-upgrade-provider');
