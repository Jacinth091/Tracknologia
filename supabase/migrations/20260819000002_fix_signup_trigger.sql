-- Drop previous trigger and function if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_provider_signup();

-- Ensure Enums exist
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

-- Ensure tables exist
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

CREATE TABLE IF NOT EXISTS public.provider_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role membership_role NOT NULL DEFAULT 'OWNER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_provider_user UNIQUE(provider_id, user_id)
);

ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_memberships ENABLE ROW LEVEL SECURITY;

-- Grant broad schema permissions so Supabase Auth internal worker can execute without errors
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, authenticated, service_role;

-- Recreate bulletproof trigger function with explicit public search_path
CREATE OR REPLACE FUNCTION public.handle_new_user_provider_signup()
RETURNS trigger
SECURITY DEFINER
SET search_path = public, pg_temp
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
  -- Safe extraction of metadata
  new_display_name := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'display_name'), ''),
    split_part(COALESCE(new.email, 'provider'), '@', 1)
  );
  
  IF (new.raw_user_meta_data->>'provider_type') = 'INDEPENDENT' THEN
    new_provider_type := 'INDEPENDENT'::public.provider_type;
  ELSE
    new_provider_type := 'SHOP'::public.provider_type;
  END IF;

  -- Generate clean URL slug
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

  -- Create Provider
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

  -- Create Owner Membership
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
    -- Fallback so user registration in auth.users NEVER fails
    RAISE WARNING 'handle_new_user_provider_signup failed: %', SQLERRM;
    RETURN new;
END;
$$;

-- Create Trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_provider_signup();
