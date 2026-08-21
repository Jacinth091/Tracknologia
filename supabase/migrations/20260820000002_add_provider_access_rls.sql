-- Migration: 20260820000002_add_provider_access_rls.sql
-- Description: Least-privilege RLS policies, public Provider projection, and atomic onboarding/invitation RPCs
-- Reference: Tracknologia Lead Decisions LD-01, LD-03; Auth Re-review AUTH-R19 through AUTH-R29

-- 1. Enable Row Level Security
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_invitations ENABLE ROW LEVEL SECURITY;

-- 2. Schema Permissions & Public Projections (Least Privilege)
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Public Provider Projection View (Explicitly projects public-safe fields only)
CREATE OR REPLACE VIEW public.public_provider_profiles AS
SELECT
  id,
  provider_type,
  display_name,
  slug,
  description,
  profile_image_url,
  public_address,
  service_area,
  supported_devices,
  accepting_requests,
  created_at
FROM public.providers
WHERE accepting_requests = true;

GRANT SELECT ON public.public_provider_profiles TO anon, authenticated;

-- Table Grants:
-- NOTE: anon has NO direct SELECT on raw public.providers table (they must query public_provider_profiles).
GRANT SELECT, UPDATE ON public.providers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.provider_user_profiles TO authenticated;
GRANT SELECT ON public.provider_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.provider_invitations TO authenticated;

-- 3. Non-recursive SECURITY DEFINER helper to return provider IDs of current authenticated user
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

REVOKE ALL ON FUNCTION public.get_auth_user_provider_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_user_provider_ids() TO authenticated;

-- 4. RLS Policies on provider_memberships
DROP POLICY IF EXISTS "Members can view provider memberships" ON public.provider_memberships;

CREATE POLICY "Members can view provider memberships"
  ON public.provider_memberships
  FOR SELECT
  TO authenticated
  USING (
    provider_id IN (SELECT public.get_auth_user_provider_ids())
  );

-- Direct INSERT/UPDATE/DELETE on provider_memberships is STRICTLY PROHIBITED for normal users.
-- All membership creations occur via atomic SECURITY DEFINER functions.

-- 5. RLS Policies on providers
DROP POLICY IF EXISTS "Provider members can view their provider" ON public.providers;
DROP POLICY IF EXISTS "Owners can update provider" ON public.providers;

CREATE POLICY "Provider members can view their provider"
  ON public.providers
  FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT public.get_auth_user_provider_ids())
  );

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

-- 6. RLS Policies on provider_user_profiles
DROP POLICY IF EXISTS "Users can view user profiles of team members or self" ON public.provider_user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.provider_user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.provider_user_profiles;

CREATE POLICY "Users can view user profiles of team members or self"
  ON public.provider_user_profiles
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR user_id IN (
      SELECT pm.user_id 
      FROM public.provider_memberships pm 
      WHERE pm.provider_id IN (SELECT public.get_auth_user_provider_ids())
    )
  );

CREATE POLICY "Users can insert own profile"
  ON public.provider_user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "Users can update own profile"
  ON public.provider_user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
  );

-- 7. RLS Policies on provider_invitations
DROP POLICY IF EXISTS "Owners can view invitations" ON public.provider_invitations;
DROP POLICY IF EXISTS "Owners can create invitations" ON public.provider_invitations;
DROP POLICY IF EXISTS "Owners can revoke invitations" ON public.provider_invitations;

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

CREATE POLICY "Owners can revoke invitations"
  ON public.provider_invitations
  FOR UPDATE
  TO authenticated
  USING (
    provider_id IN (
      SELECT provider_id FROM public.provider_memberships
      WHERE user_id = auth.uid() AND role = 'OWNER'
    )
  )
  WITH CHECK (
    provider_id IN (
      SELECT provider_id FROM public.provider_memberships
      WHERE user_id = auth.uid() AND role = 'OWNER'
    )
  );

-- 8. Atomic RPC: Create Provider with Initial OWNER (Independent or Shop Owner Onboarding)
DROP FUNCTION IF EXISTS public.create_provider_with_owner(TEXT, public.provider_type);
DROP FUNCTION IF EXISTS public.create_provider_with_owner(TEXT, public.provider_type, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]);

CREATE OR REPLACE FUNCTION public.create_provider_with_owner(
  p_display_name TEXT,
  p_provider_type public.provider_type,
  p_owner_display_name TEXT DEFAULT NULL,
  p_owner_contact_phone TEXT DEFAULT NULL,
  p_contact_email TEXT DEFAULT NULL,
  p_contact_phone TEXT DEFAULT NULL,
  p_public_address TEXT DEFAULT NULL,
  p_service_area TEXT DEFAULT NULL,
  p_supported_devices TEXT[] DEFAULT '{}'
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
  v_owner_name TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Invariant: User cannot already have ANY active provider membership
  IF EXISTS (SELECT 1 FROM public.provider_memberships pm WHERE pm.user_id = v_user_id) THEN
    RAISE EXCEPTION 'User already has an active provider membership';
  END IF;

  SELECT u.email INTO v_user_email FROM auth.users u WHERE u.id = v_user_id;

  v_owner_name := COALESCE(NULLIF(trim(p_owner_display_name), ''), NULLIF(trim(p_display_name), ''), NULLIF(trim(v_user_email), ''), 'Owner');

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

  -- 1. Atomically insert Provider with full initial profile
  INSERT INTO public.providers (
    display_name,
    provider_type,
    slug,
    contact_email,
    contact_phone,
    public_address,
    service_area,
    supported_devices
  ) VALUES (
    trim(p_display_name),
    p_provider_type,
    v_slug,
    COALESCE(NULLIF(trim(p_contact_email), ''), v_user_email),
    NULLIF(trim(p_contact_phone), ''),
    NULLIF(trim(p_public_address), ''),
    NULLIF(trim(p_service_area), ''),
    COALESCE(p_supported_devices, '{}')
  ) RETURNING id INTO v_provider_id;

  -- 2. Atomically upsert person profile in provider_user_profiles
  INSERT INTO public.provider_user_profiles (
    user_id,
    display_name,
    contact_phone
  ) VALUES (
    v_user_id,
    v_owner_name,
    NULLIF(trim(p_owner_contact_phone), '')
  )
  ON CONFLICT (user_id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      contact_phone = COALESCE(EXCLUDED.contact_phone, public.provider_user_profiles.contact_phone),
      updated_at = now();

  -- 3. Atomically insert OWNER membership (authorization link only)
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

-- 9. Atomic RPC: Accept Staff Invitation (Shop Staff Onboarding)
DROP FUNCTION IF EXISTS public.accept_staff_invitation(TEXT);
DROP FUNCTION IF EXISTS public.accept_staff_invitation(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.accept_staff_invitation(
  p_token_hash TEXT,
  p_display_name TEXT,
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
  v_provider_type public.provider_type;
  v_staff_name TEXT;
  v_user_email TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Invariant: User cannot already have ANY active provider membership while multi-provider is unsupported
  IF EXISTS (SELECT 1 FROM public.provider_memberships pm WHERE pm.user_id = v_user_id) THEN
    RAISE EXCEPTION 'User already has an active provider membership';
  END IF;

  -- Look up valid, active, non-expired, unconsumed invitation with row lock
  SELECT pi.id, pi.provider_id, pi.role, pi.email, p.provider_type
  INTO v_invitation_id, v_provider_id, v_invite_role, v_invite_email, v_provider_type
  FROM public.provider_invitations pi
  JOIN public.providers p ON p.id = pi.provider_id
  WHERE pi.token_hash = p_token_hash
    AND pi.accepted_at IS NULL
    AND pi.revoked_at IS NULL
    AND pi.expires_at > now()
  FOR UPDATE OF pi;

  IF v_invitation_id IS NULL THEN
    RAISE EXCEPTION 'Invalid, expired, or revoked invitation';
  END IF;

  -- Invariant: Staff invitations are valid ONLY for SHOP providers
  IF v_provider_type <> 'SHOP' THEN
    RAISE EXCEPTION 'Staff invitations are only valid for Repair Shops';
  END IF;

  SELECT u.email INTO v_user_email FROM auth.users u WHERE u.id = v_user_id;

  v_staff_name := COALESCE(NULLIF(trim(p_display_name), ''), NULLIF(trim(v_user_email), ''), NULLIF(trim(v_invite_email), ''), 'Staff');

  -- 1. Atomically upsert person profile in provider_user_profiles
  INSERT INTO public.provider_user_profiles (
    user_id,
    display_name,
    contact_phone
  ) VALUES (
    v_user_id,
    v_staff_name,
    NULLIF(trim(p_contact_phone), '')
  )
  ON CONFLICT (user_id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      contact_phone = COALESCE(EXCLUDED.contact_phone, public.provider_user_profiles.contact_phone),
      updated_at = now();

  -- 2. Atomically insert STAFF membership (authorization link only)
  INSERT INTO public.provider_memberships (
    provider_id,
    user_id,
    role
  ) VALUES (
    v_provider_id,
    v_user_id,
    v_invite_role
  ) RETURNING id INTO v_membership_id;

  -- 3. Mark invitation as accepted atomically
  UPDATE public.provider_invitations
  SET accepted_at = now(),
      accepted_by_user_id = v_user_id
  WHERE id = v_invitation_id;

  RETURN QUERY SELECT v_provider_id, v_membership_id, v_invite_role;
END;
$$;

-- 10. Safe RPC: Resolve Invitation & Shop Details (For Staff Onboarding UI)
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

-- 11. Explicit Grants and Revokes
REVOKE ALL ON FUNCTION public.create_provider_with_owner(TEXT, public.provider_type, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_provider_with_owner(TEXT, public.provider_type, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_staff_invitation(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_staff_invitation(TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.get_invitation_details(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation_details(TEXT) TO authenticated, anon;

