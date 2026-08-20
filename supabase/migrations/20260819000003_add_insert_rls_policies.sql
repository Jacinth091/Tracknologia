-- 1. Allow authenticated users to create a new provider
DROP POLICY IF EXISTS "Authenticated users can create providers" ON public.providers;
CREATE POLICY "Authenticated users can create providers"
  ON public.providers
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 2. Allow authenticated users to create their own membership
DROP POLICY IF EXISTS "Users can create their own membership" ON public.provider_memberships;
CREATE POLICY "Users can create their own membership"
  ON public.provider_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
