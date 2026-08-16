-- Fix infinite recursion in profiles RLS policies
-- The admin policies were querying the profiles table to check role,
-- which triggered RLS evaluation again, causing infinite recursion.

-- Create a security definer function to check if current user is admin (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  user_role user_role;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE id = auth.uid();
  RETURN user_role IN ('admin', 'superadmin', 'moderator');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create a function to check if current user is superadmin
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
DECLARE
  user_role user_role;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE id = auth.uid();
  RETURN user_role IN ('admin', 'superadmin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Drop the problematic policies
DROP POLICY IF EXISTS profiles_admin_select ON profiles;
DROP POLICY IF EXISTS profiles_admin_update ON profiles;

-- Recreate policies using the security definer functions
CREATE POLICY profiles_admin_select ON profiles
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY profiles_admin_update ON profiles
  FOR UPDATE
  USING (public.is_superadmin());
