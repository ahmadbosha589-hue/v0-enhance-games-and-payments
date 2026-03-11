-- Fix RLS recursion properly
-- The issue: admin policies query profiles table, causing infinite recursion
-- Solution: Use SECURITY DEFINER functions that SET search_path and bypass RLS internally

-- Drop existing problematic functions
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.is_superadmin() CASCADE;

-- Create improved is_admin function that uses raw SQL to bypass RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Direct query bypassing RLS due to SECURITY DEFINER
  SELECT role::TEXT INTO user_role 
  FROM public.profiles 
  WHERE id = auth.uid();
  
  RETURN COALESCE(user_role IN ('admin', 'superadmin', 'moderator'), FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Create improved is_superadmin function
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role::TEXT INTO user_role 
  FROM public.profiles 
  WHERE id = auth.uid();
  
  RETURN COALESCE(user_role IN ('admin', 'superadmin'), FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Drop ALL existing profile policies to start fresh
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;

-- Recreate policies with proper logic
-- 1. Users can ALWAYS read their own profile (no admin check needed)
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- 2. Users can update their own profile
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 3. Allow insert for new users
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 4. Admins can view OTHER profiles (not their own - that's covered by profiles_select_own)
CREATE POLICY "profiles_admin_select" ON public.profiles
  FOR SELECT USING (
    auth.uid() != id AND public.is_admin()
  );

-- 5. Superadmins can update OTHER profiles
CREATE POLICY "profiles_admin_update" ON public.profiles
  FOR UPDATE USING (
    auth.uid() != id AND public.is_superadmin()
  );

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
