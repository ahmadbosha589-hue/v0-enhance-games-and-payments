-- Fix RLS policy to allow both admin and superadmin to update system settings

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "system_settings_admin_all" ON public.system_settings;

-- Create new policy that allows both admin and superadmin roles
CREATE POLICY "system_settings_admin_all" ON public.system_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'superadmin')
    )
  );
