-- Issue #88: private internal-operator access and append-only access audit.
--
-- This migration deliberately adds no seed identities, no signup trigger, no
-- auth-metadata role, and no Provider-role alias. A mapping is private
-- operational state; it is provisioned only by a deliberate, owner-approved
-- service-role admin operation (see docs/OPERATIONS.md).
--
-- Retention/purge of internal_access_audit is intentionally NOT defined here:
-- that policy still requires explicit owner approval (issue #87). Until then
-- audit rows are append-only and retained.

CREATE TABLE public.internal_operators (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provisioned_at TIMESTAMPTZ,
  provisioned_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  reason TEXT,
  CONSTRAINT internal_operators_reason_bounded CHECK (
    reason IS NULL
    OR (char_length(btrim(reason)) BETWEEN 3 AND 200)
  )
);

COMMENT ON TABLE public.internal_operators IS
  'Private internal-operator mapping. Not a Provider role. Auth deletion removes the live permission.';
COMMENT ON COLUMN public.internal_operators.reason IS
  'Bounded reason for the most recent deliberate provision/revoke operation.';

CREATE TABLE public.internal_access_audit (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  operation TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT internal_access_audit_operation_fixed CHECK (
    operation IN (
      'OPERATOR_PROVISIONED',
      'OPERATOR_REVOKED',
      'INTERNAL_ACCESS_VIEW'
    )
  ),
  CONSTRAINT internal_access_audit_reason_bounded CHECK (
    reason IS NULL
    OR (char_length(btrim(reason)) BETWEEN 3 AND 200)
  )
);

COMMENT ON TABLE public.internal_access_audit IS
  'Append-only internal access audit. No Provider/Repair/Customer identifiers, email, path, or payload. Auth deletion anonymizes the FKs (ON DELETE SET NULL) and preserves the non-identifying event.';
COMMENT ON COLUMN public.internal_access_audit.reason IS
  'Bounded reason for deliberate provision/revoke events only; null for application access events.';

ALTER TABLE public.internal_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_access_audit ENABLE ROW LEVEL SECURITY;

-- No RLS policies are created: ordinary clients are denied by grants plus the
-- absence of policies. The table owner (SECURITY DEFINER functions below) and
-- the service role can still read; service_role receives SELECT only.
REVOKE ALL ON TABLE public.internal_operators FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.internal_access_audit
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.internal_operators TO service_role;
GRANT SELECT ON TABLE public.internal_access_audit TO service_role;

-- Deliberate admin operation: atomically change the enabled mapping and append
-- the required provision/revoke audit event, or roll everything back.
-- Repeated grant/revoke of the same state is an explicit no-op returning FALSE
-- and appends no duplicate event. Revoking an absent mapping never grants
-- access. Actor existence is enforced by the audit FK at write time, in the
-- same transaction as the mapping change, so an invalid actor rolls back the
-- mapping too. Service-role execution only: this is a runbook surface, never a
-- public HTTP action.
CREATE OR REPLACE FUNCTION public.change_internal_operator_access(
  p_operator_user_id UUID,
  p_actor_user_id UUID,
  p_enabled BOOLEAN,
  p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.internal_operators%ROWTYPE;
  v_reason TEXT;
BEGIN
  IF p_operator_user_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Operator, actor, and target state are required';
  END IF;

  v_reason := btrim(coalesce(p_reason, ''));
  IF char_length(v_reason) < 3 OR char_length(v_reason) > 200 THEN
    RAISE EXCEPTION 'A bounded reason of 3 to 200 characters is required';
  END IF;

  -- Serializes concurrent admin changes for the same operator so repeated
  -- grant/revoke stays an idempotent no-op instead of racing to a duplicate
  -- audit event.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operator_user_id::text, 0));

  SELECT *
  INTO v_existing
  FROM public.internal_operators
  WHERE user_id = p_operator_user_id
  FOR UPDATE;

  IF p_enabled THEN
    IF FOUND AND v_existing.enabled THEN
      RETURN FALSE;
    END IF;

    INSERT INTO public.internal_operators (
      user_id,
      enabled,
      provisioned_at,
      provisioned_by,
      revoked_at,
      revoked_by,
      reason
    )
    VALUES (
      p_operator_user_id,
      TRUE,
      now(),
      p_actor_user_id,
      NULL,
      NULL,
      v_reason
    )
    ON CONFLICT (user_id) DO UPDATE
    SET enabled = TRUE,
        provisioned_at = now(),
        provisioned_by = EXCLUDED.provisioned_by,
        revoked_at = NULL,
        revoked_by = NULL,
        reason = EXCLUDED.reason;

    INSERT INTO public.internal_access_audit (
      operator_user_id,
      actor_user_id,
      operation,
      reason
    )
    VALUES (
      p_operator_user_id,
      p_actor_user_id,
      'OPERATOR_PROVISIONED',
      v_reason
    );

    RETURN TRUE;
  END IF;

  IF NOT FOUND OR NOT v_existing.enabled THEN
    RETURN FALSE;
  END IF;

  UPDATE public.internal_operators
  SET enabled = FALSE,
      revoked_at = now(),
      revoked_by = p_actor_user_id,
      reason = v_reason
  WHERE user_id = p_operator_user_id;

  INSERT INTO public.internal_access_audit (
    operator_user_id,
    actor_user_id,
    operation,
    reason
  )
  VALUES (
    p_operator_user_id,
    p_actor_user_id,
    'OPERATOR_REVOKED',
    v_reason
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.change_internal_operator_access(UUID, UUID, BOOLEAN, TEXT) IS
  'Service-role-only atomic grant/revoke of the private internal-operator mapping plus its audit event. Idempotent repeats return FALSE without a new event.';

REVOKE ALL ON FUNCTION public.change_internal_operator_access(
  UUID,
  UUID,
  BOOLEAN,
  TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_internal_operator_access(
  UUID,
  UUID,
  BOOLEAN,
  TEXT
) TO service_role;

-- Application access audit: authenticated only, actor always derived from the
-- authenticated session, category restricted to the fixed sensitive-operation
-- set, and the enabled mapping rechecked under a row lock that serializes
-- against a concurrent revocation (enabled is mutable, so FOR SHARE is used
-- rather than FOR KEY SHARE). Provision/revoke categories cannot be forged
-- here. Any failure raises, so callers fail closed instead of rendering
-- protected content without an audit event.
CREATE OR REPLACE FUNCTION public.record_internal_operation_access(
  p_operation_category TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_enabled BOOLEAN;
  v_event_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_operation_category IS NULL
    OR p_operation_category <> 'INTERNAL_ACCESS_VIEW' THEN
    RAISE EXCEPTION 'Unsupported internal operation category';
  END IF;

  SELECT io.enabled
  INTO v_enabled
  FROM public.internal_operators io
  WHERE io.user_id = v_user_id
  FOR SHARE;

  IF v_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'Internal operator access required';
  END IF;

  INSERT INTO public.internal_access_audit (
    operator_user_id,
    actor_user_id,
    operation
  )
  VALUES (
    v_user_id,
    v_user_id,
    p_operation_category
  )
  RETURNING event_id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.record_internal_operation_access(TEXT) IS
  'Authenticated append-only internal access audit. Derives the actor itself, accepts only fixed sensitive-operation categories, rechecks the enabled mapping under a shared row lock, and raises on any denial or failure.';

REVOKE ALL ON FUNCTION public.record_internal_operation_access(TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_internal_operation_access(TEXT)
  TO authenticated;
