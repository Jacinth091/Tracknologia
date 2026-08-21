-- Migration: 20260820000001_create_provider_identity.sql
-- Description: Core schema for Providers, Provider User Profiles, Provider Memberships, and Staff Invitations
-- Reference: Tracknologia Lead Decisions LD-01, LD-03; Auth Re-review AUTH-R19 through AUTH-R30

-- 1. Enums
CREATE TYPE public.provider_type AS ENUM ('SHOP', 'INDEPENDENT');
CREATE TYPE public.membership_role AS ENUM ('OWNER', 'STAFF');

-- 2. Providers table (Business entity & profile)
CREATE TABLE public.providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_type public.provider_type NOT NULL DEFAULT 'SHOP',
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_providers_display_name_nonblank CHECK (char_length(trim(display_name)) > 0)
);

-- 3. Provider User Profiles table (Canonical person profile for authenticated provider users)
CREATE TABLE public.provider_user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  contact_phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_user_profiles_display_name_nonblank CHECK (char_length(trim(display_name)) > 0)
);

-- 4. Provider Memberships table (Authorization relationship only)
CREATE TABLE public.provider_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.membership_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_provider_user UNIQUE (provider_id, user_id)
);

-- 5. Provider Invitations table (Secure Staff Onboarding)
CREATE TABLE public.provider_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.membership_role NOT NULL DEFAULT 'STAFF',
  token_hash TEXT UNIQUE NOT NULL,
  invited_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT check_invitation_role CHECK (role = 'STAFF'),
  CONSTRAINT check_token_hash_format CHECK (token_hash ~* '^[a-f0-9]{64}$')
);

-- 6. Indexes (Omitting redundant indexes on UNIQUE columns such as providers.slug)
CREATE INDEX idx_provider_memberships_user_id ON public.provider_memberships(user_id);
CREATE INDEX idx_provider_memberships_provider_id ON public.provider_memberships(provider_id);
CREATE INDEX idx_provider_invitations_email ON public.provider_invitations(email);
CREATE INDEX idx_provider_invitations_provider_id ON public.provider_invitations(provider_id);

