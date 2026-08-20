-- Migration: 20260820000003_fix_provider_team_members_and_rls.sql
-- Description: Add member profile fields to provider_memberships, non-recursive RLS, and clean onboarding RPCs

-- 1. Add profile fields to provider_memberships table
ALTER TABLE public.provider_memberships 
ADD COLUMN IF NOT EXISTS display_name TEXT,
ADD COLUMN IF NOT EXISTS contact_email TEXT,
ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- Backfill existing memberships with email/display_name from auth.users
UPDATE public.provider_memberships pm
SET 
  display_name = COALESCE(NULLIF(trim(u.raw_user_meta_data->>'display_name'), ''), NULLIF(trim(u.email), ''), 'Team Member'),
  contact_email = u.email,
  contact_phone = u.raw_user_meta_data->>'contact_phone'
FROM auth.users u
WHERE pm.user_id = u.id AND pm.display_name IS NULL;

-- 2. Non-recursive security definer function to return provider IDs of the current user
DROP FUNCTION IF EXISTS public.get_auth_user_provider_ids();
CREATE OR REPLACE FUNCTION public.get_auth_user_provider_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT provider_id FROM public.provider_memberships WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_auth_user_provider_ids() TO authenticated;

-- 3. RLS Policies on provider_memberships
DROP POLICY IF EXISTS "Users can view own memberships" ON public.provider_memberships;
DROP POLICY IF EXISTS "Members can view provider memberships" ON public.provider_memberships;

CREATE POLICY "Members can view provider memberships"
  ON public.provider_memberships
  FOR SELECT
  TO authenticated
  USING (
    provider_id IN (SELECT public.get_auth_user_provider_ids())
  );

-- 4. Update create_provider_with_owner to populate owner profile on membership
DROP FUNCTION IF EXISTS public.create_provider_with_owner(TEXT, public.provider_type);
CREATE OR REPLACE FUNCTION public.create_provider_with_owner(
  p_display_name TEXT,
  p_provider_type public.provider_type
)
RETURNS TABLE (
  provider_id UUID,
  membership_id UUID,
  slug TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_provider_id UUID;
  v_membership_id UUID;
  v_base_slug TEXT;
  v_slug TEXT;
  v_counter INT := 0;
  v_user_email TEXT;
  v_user_display_name TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- User cannot already have an active provider membership
  IF EXISTS (SELECT 1 FROM public.provider_memberships pm WHERE pm.user_id = v_user_id) THEN
    RAISE EXCEPTION 'User already has an active provider membership';
  END IF;

  SELECT u.email, COALESCE(NULLIF(trim(u.raw_user_meta_data->>'display_name'), ''), trim(p_display_name))
  INTO v_user_email, v_user_display_name
  FROM auth.users u WHERE u.id = v_user_id;

  -- Generate unique slug
  v_base_slug := lower(regexp_replace(COALESCE(NULLIF(trim(p_display_name), ''), 'provider'), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug = '' THEN
    v_base_slug := 'provider';
  END IF;

  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM public.providers p WHERE p.slug = v_slug) LOOP
    v_counter := v_counter + 1;
    v_slug := v_base_slug || '-' || v_counter;
  END LOOP;

  -- Atomically insert Provider
  INSERT INTO public.providers (
    display_name,
    provider_type,
    slug,
    contact_email
  ) VALUES (
    trim(p_display_name),
    p_provider_type,
    v_slug,
    v_user_email
  ) RETURNING id INTO v_provider_id;

  -- Atomically insert OWNER membership with profile details
  INSERT INTO public.provider_memberships (
    provider_id,
    user_id,
    role,
    display_name,
    contact_email
  ) VALUES (
    v_provider_id,
    v_user_id,
    'OWNER'::public.membership_role,
    v_user_display_name,
    v_user_email
  ) RETURNING id INTO v_membership_id;

  RETURN QUERY SELECT v_provider_id, v_membership_id, v_slug;
END;
$$;

-- 5. Update accept_staff_invitation to accept staff profile details
DROP FUNCTION IF EXISTS public.accept_staff_invitation(TEXT);
DROP FUNCTION IF EXISTS public.accept_staff_invitation(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.accept_staff_invitation(
  p_token_hash TEXT,
  p_display_name TEXT DEFAULT NULL,
  p_contact_phone TEXT DEFAULT NULL
)
RETURNS TABLE (
  provider_id UUID,
  membership_id UUID,
  role public.membership_role
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_invitation_id UUID;
  v_provider_id UUID;
  v_membership_id UUID;
  v_invite_role public.membership_role;
  v_invite_email TEXT;
  v_staff_name TEXT;
  v_user_email TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Look up valid, active, non-expired, unconsumed invitation
  SELECT pi.id, pi.provider_id, pi.role, pi.email
  INTO v_invitation_id, v_provider_id, v_invite_role, v_invite_email
  FROM public.provider_invitations pi
  WHERE pi.token_hash = p_token_hash
    AND pi.accepted_at IS NULL
    AND pi.revoked_at IS NULL
    AND pi.expires_at > now()
  FOR UPDATE;

  IF v_invitation_id IS NULL THEN
    RAISE EXCEPTION 'Invalid, expired, or revoked invitation';
  END IF;

  -- Verify user does not already belong to this provider
  IF EXISTS (
    SELECT 1 FROM public.provider_memberships pm
    WHERE pm.provider_id = v_provider_id AND pm.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'User is already a member of this provider';
  END IF;

  SELECT u.email INTO v_user_email FROM auth.users u WHERE u.id = v_user_id;

  v_staff_name := COALESCE(NULLIF(trim(p_display_name), ''), NULLIF(trim(v_invite_email), ''), 'Staff Technician');

  -- Create STAFF membership with full name and contact info
  INSERT INTO public.provider_memberships (
    provider_id,
    user_id,
    role,
    display_name,
    contact_email,
    contact_phone
  ) VALUES (
    v_provider_id,
    v_user_id,
    v_invite_role,
    v_staff_name,
    COALESCE(v_user_email, v_invite_email),
    NULLIF(trim(p_contact_phone), '')
  ) RETURNING id INTO v_membership_id;

  -- Mark invitation as accepted atomically
  UPDATE public.provider_invitations
  SET accepted_at = now(),
      accepted_by_user_id = v_user_id
  WHERE id = v_invitation_id;

  RETURN QUERY SELECT v_provider_id, v_membership_id, v_invite_role;
END;
$$;

-- 6. Safe RPC: Resolve Invitation & Shop Details (For Staff Onboarding UI)
DROP FUNCTION IF EXISTS public.get_invitation_details(TEXT);
CREATE OR REPLACE FUNCTION public.get_invitation_details(
  p_token_hash TEXT
)
RETURNS TABLE (
  invitation_id UUID,
  email TEXT,
  role public.membership_role,
  provider_id UUID,
  shop_name TEXT,
  public_address TEXT,
  service_area TEXT,
  contact_email TEXT,
  contact_phone TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pi.id AS invitation_id,
    pi.email::TEXT,
    pi.role,
    p.id AS provider_id,
    p.display_name::TEXT AS shop_name,
    p.public_address::TEXT,
    p.service_area::TEXT,
    p.contact_email::TEXT,
    p.contact_phone::TEXT
  FROM public.provider_invitations pi
  JOIN public.providers p ON p.id = pi.provider_id
  WHERE pi.token_hash = p_token_hash
    AND pi.accepted_at IS NULL
    AND pi.revoked_at IS NULL
    AND pi.expires_at > now()
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_provider_with_owner(TEXT, public.provider_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_staff_invitation(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invitation_details(TEXT) TO authenticated, anon;
