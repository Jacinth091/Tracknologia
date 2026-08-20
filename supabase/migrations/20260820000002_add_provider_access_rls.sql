-- Migration: 20260820000002_add_provider_access_rls.sql
-- Description: Least-privilege RLS policies and atomic onboarding/invitation RPCs
-- Reference: Tracknologia Lead Decisions LD-01, LD-03

-- 1. Enable Row Level Security
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_invitations ENABLE ROW LEVEL SECURITY;

-- 2. Schema Permissions (Least Privilege)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.providers TO anon, authenticated;
GRANT UPDATE ON public.providers TO authenticated;
GRANT SELECT ON public.provider_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.provider_invitations TO authenticated;

-- 3. RLS Policies on provider_memberships
-- Users can only read their own memberships (Non-recursive)
CREATE POLICY "Users can view own memberships"
  ON public.provider_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- NOTE: Direct client INSERT/UPDATE/DELETE on provider_memberships is STRICTLY PROHIBITED.
-- All membership creations occur via atomic SECURITY DEFINER functions (Owner onboarding / Staff invitation acceptance).

-- 4. RLS Policies on providers
-- Members can view their associated provider
CREATE POLICY "Provider members can view their provider"
  ON public.providers
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT provider_id FROM public.provider_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Public can view active providers for intake
CREATE POLICY "Public can view active providers"
  ON public.providers
  FOR SELECT
  TO anon, authenticated
  USING (accepting_requests = true);

-- Only OWNERs can update provider details
CREATE POLICY "Owners can update provider"
  ON public.providers
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT provider_id FROM public.provider_memberships
      WHERE user_id = auth.uid() AND role = 'OWNER'
    )
  );

-- 5. RLS Policies on provider_invitations
-- Only OWNERs can view/manage invitations for their provider
CREATE POLICY "Owners can view invitations"
  ON public.provider_invitations
  FOR SELECT
  TO authenticated
  USING (
    provider_id IN (
      SELECT provider_id FROM public.provider_memberships
      WHERE user_id = auth.uid() AND role = 'OWNER'
    )
  );

CREATE POLICY "Owners can create invitations"
  ON public.provider_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    provider_id IN (
      SELECT provider_id FROM public.provider_memberships
      WHERE user_id = auth.uid() AND role = 'OWNER'
    )
    AND invited_by_user_id = auth.uid()
  );

CREATE POLICY "Owners can update invitations"
  ON public.provider_invitations
  FOR UPDATE
  TO authenticated
  USING (
    provider_id IN (
      SELECT provider_id FROM public.provider_memberships
      WHERE user_id = auth.uid() AND role = 'OWNER'
    )
  );

-- 6. Atomic RPC: Create Provider with Initial OWNER (Independent or Shop Owner Onboarding)
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- User cannot already have an active provider membership
  IF EXISTS (SELECT 1 FROM public.provider_memberships pm WHERE pm.user_id = v_user_id) THEN
    RAISE EXCEPTION 'User already has an active provider membership';
  END IF;

  SELECT u.email INTO v_user_email FROM auth.users u WHERE u.id = v_user_id;

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

  -- Atomically insert OWNER membership
  INSERT INTO public.provider_memberships (
    provider_id,
    user_id,
    role
  ) VALUES (
    v_provider_id,
    v_user_id,
    'OWNER'::public.membership_role
  ) RETURNING id INTO v_membership_id;

  RETURN QUERY SELECT v_provider_id, v_membership_id, v_slug;
END;
$$;

-- 7. Atomic RPC: Accept Staff Invitation (Shop Staff Onboarding)
CREATE OR REPLACE FUNCTION public.accept_staff_invitation(
  p_token_hash TEXT
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Look up valid, active, non-expired, unconsumed invitation
  SELECT pi.id, pi.provider_id, pi.role
  INTO v_invitation_id, v_provider_id, v_invite_role
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

  -- Create STAFF membership
  INSERT INTO public.provider_memberships (
    provider_id,
    user_id,
    role
  ) VALUES (
    v_provider_id,
    v_user_id,
    v_invite_role
  ) RETURNING id INTO v_membership_id;

  -- Mark invitation as accepted atomically
  UPDATE public.provider_invitations
  SET accepted_at = now(),
      accepted_by_user_id = v_user_id
  WHERE id = v_invitation_id;

  RETURN QUERY SELECT v_provider_id, v_membership_id, v_invite_role;
END;
$$;

-- 8. Safe RPC: Resolve Invitation & Shop Details (For Staff Onboarding UI)
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
    pi.email,
    pi.role,
    p.id AS provider_id,
    p.display_name AS shop_name,
    p.public_address,
    p.service_area,
    p.contact_email,
    p.contact_phone
  FROM public.provider_invitations pi
  JOIN public.providers p ON p.id = pi.provider_id
  WHERE pi.token_hash = p_token_hash
    AND pi.accepted_at IS NULL
    AND pi.revoked_at IS NULL
    AND pi.expires_at > now()
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.create_provider_with_owner(TEXT, public.provider_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_provider_with_owner(TEXT, public.provider_type) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_staff_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_staff_invitation(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.get_invitation_details(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation_details(TEXT) TO authenticated, anon;
