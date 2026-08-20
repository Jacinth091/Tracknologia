-- Fix infinite recursion in provider_memberships policies

-- 1. Drop the recursive policy on provider_memberships
DROP POLICY IF EXISTS "Owners can view all provider members" ON public.provider_memberships;
DROP POLICY IF EXISTS "Users can view own memberships" ON public.provider_memberships;

-- 2. Create clean, non-recursive SELECT policy on provider_memberships
CREATE POLICY "Users can view own memberships"
  ON public.provider_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 3. Fix providers SELECT policy to avoid recursion
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
