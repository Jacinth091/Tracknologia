-- Forward compatibility migration for databases that previously applied
-- an older create_staff_invitation definition.

DROP FUNCTION IF EXISTS public.create_staff_invitation(
  TEXT,
  TEXT,
  TIMESTAMPTZ
);

DROP FUNCTION IF EXISTS public.create_staff_invitation(
  TEXT,
  TEXT
);

CREATE OR REPLACE FUNCTION public.create_staff_invitation(
  p_email TEXT,
  p_token_hash TEXT
)
RETURNS TABLE (
  invitation_id UUID,
  provider_id UUID,
  email TEXT,
  role public.membership_role,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user_id UUID;
  v_provider_id UUID;
  v_provider_type public.provider_type;
  v_invitation_id UUID;
  v_created_at TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
  v_clean_email TEXT;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_clean_email := lower(trim(p_email));

  IF v_clean_email IS NULL OR v_clean_email = '' THEN
    RAISE EXCEPTION 'Valid email address is required';
  END IF;

  IF p_token_hash IS NULL
     OR p_token_hash !~* '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid token hash format';
  END IF;

  SELECT
    pm.provider_id,
    p.provider_type
  INTO
    v_provider_id,
    v_provider_type
  FROM public.provider_memberships pm
  JOIN public.providers p
    ON p.id = pm.provider_id
  WHERE pm.user_id = v_user_id
    AND pm.role = 'OWNER'
  LIMIT 1;

  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION
      'Only Provider Owners can invite staff members';
  END IF;

  IF v_provider_type <> 'SHOP' THEN
    RAISE EXCEPTION
      'Staff invitations are only valid for Repair Shops';
  END IF;

  v_created_at := now();
  v_expires_at := v_created_at + interval '7 days';

  INSERT INTO public.provider_invitations AS pi (
    provider_id,
    email,
    role,
    token_hash,
    invited_by_user_id,
    created_at,
    expires_at
  )
  VALUES (
    v_provider_id,
    v_clean_email,
    'STAFF'::public.membership_role,
    p_token_hash,
    v_user_id,
    v_created_at,
    v_expires_at
  )
  RETURNING
    pi.id
  INTO
    v_invitation_id;

  RETURN QUERY
  SELECT
    v_invitation_id,
    v_provider_id,
    v_clean_email,
    'STAFF'::public.membership_role,
    v_created_at,
    v_expires_at;
END;
$$;

REVOKE ALL
ON FUNCTION public.create_staff_invitation(TEXT, TEXT)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.create_staff_invitation(TEXT, TEXT)
TO authenticated;
