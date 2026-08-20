-- 1. Create Enums
DO $$ BEGIN
  CREATE TYPE provider_type AS ENUM ('SHOP', 'INDEPENDENT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE membership_role AS ENUM ('OWNER', 'STAFF');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create Providers Table
CREATE TABLE IF NOT EXISTS public.providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_type provider_type NOT NULL DEFAULT 'SHOP',
  display_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  profile_image_url TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  public_address TEXT,
  service_area TEXT,
  supported_devices TEXT[] DEFAULT '{}',
  accepting_requests BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create Provider Memberships Table
CREATE TABLE IF NOT EXISTS public.provider_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role membership_role NOT NULL DEFAULT 'OWNER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_provider_user UNIQUE(provider_id, user_id)
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_memberships ENABLE ROW LEVEL SECURITY;

-- 5. Providers RLS Policies
DROP POLICY IF EXISTS "Provider members can view their own provider" ON public.providers;
CREATE POLICY "Provider members can view their own provider"
  ON public.providers
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT provider_id FROM public.provider_memberships
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Provider owners can update their provider" ON public.providers;
CREATE POLICY "Provider owners can update their provider"
  ON public.providers
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT provider_id FROM public.provider_memberships
      WHERE user_id = auth.uid() AND role = 'OWNER'
    )
  );

DROP POLICY IF EXISTS "Public can view active providers" ON public.providers;
CREATE POLICY "Public can view active providers"
  ON public.providers
  FOR SELECT
  TO anon
  USING (accepting_requests = true);

-- 6. Provider Memberships RLS Policies
DROP POLICY IF EXISTS "Users can view own memberships" ON public.provider_memberships;
CREATE POLICY "Users can view own memberships"
  ON public.provider_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners can view all provider members" ON public.provider_memberships;
CREATE POLICY "Owners can view all provider members"
  ON public.provider_memberships
  FOR SELECT
  TO authenticated
  USING (
    provider_id IN (
      SELECT provider_id FROM public.provider_memberships
      WHERE user_id = auth.uid() AND role = 'OWNER'
    )
  );

-- 7. Grant Permissions to authenticated and service_role
GRANT ALL ON public.providers TO authenticated, service_role, postgres;
GRANT ALL ON public.provider_memberships TO authenticated, service_role, postgres;
GRANT SELECT ON public.providers TO anon;

-- 8. Auto-provision Provider and Owner Membership upon Signup Trigger
CREATE OR REPLACE FUNCTION public.handle_new_user_provider_signup()
RETURNS trigger
SECURITY DEFINER
SET search_path = public, auth, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  new_display_name TEXT;
  new_provider_type public.provider_type;
  new_slug TEXT;
  new_provider_id UUID;
  base_slug TEXT;
  counter INT := 0;
BEGIN
  -- Extract signup metadata safely
  new_display_name := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'display_name'), ''),
    split_part(COALESCE(new.email, 'provider'), '@', 1)
  );
  
  IF (new.raw_user_meta_data->>'provider_type') = 'INDEPENDENT' THEN
    new_provider_type := 'INDEPENDENT'::public.provider_type;
  ELSE
    new_provider_type := 'SHOP'::public.provider_type;
  END IF;

  -- Generate clean slug
  base_slug := lower(regexp_replace(new_display_name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  IF base_slug = '' THEN
    base_slug := 'provider';
  END IF;
  
  new_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM public.providers WHERE slug = new_slug) LOOP
    counter := counter + 1;
    new_slug := base_slug || '-' || counter;
  END LOOP;

  -- Insert Provider row
  INSERT INTO public.providers (
    provider_type,
    display_name,
    slug,
    contact_email
  ) VALUES (
    new_provider_type,
    new_display_name,
    new_slug,
    new.email
  ) RETURNING id INTO new_provider_id;

  -- Insert Provider Owner Membership
  INSERT INTO public.provider_memberships (
    provider_id,
    user_id,
    role
  ) VALUES (
    new_provider_id,
    new.id,
    'OWNER'::public.membership_role
  );

  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    -- Prevent signup failure if trigger encounters unexpected error
    RAISE LOG 'Error in handle_new_user_provider_signup: %', SQLERRM;
    RETURN new;
END;
$$;

-- Trigger to execute automatically after auth.users insertion
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_provider_signup();
