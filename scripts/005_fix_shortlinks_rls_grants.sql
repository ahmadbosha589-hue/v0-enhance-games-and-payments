-- =====================================================
-- FIX: Grant SELECT permissions on shortlinks to authenticated/anon roles
-- This ensures the Supabase anon client can read active shortlinks
-- even when RLS is enabled.
-- =====================================================

-- Grant SELECT on shortlinks to authenticated and anon roles
GRANT SELECT ON public.shortlinks TO authenticated;
GRANT SELECT ON public.shortlinks TO anon;

-- Grant SELECT on shortlink_views to authenticated (for viewing own records)
GRANT SELECT ON public.shortlink_views TO authenticated;

-- Grant INSERT on shortlink_views to authenticated (for recording views)
GRANT INSERT ON public.shortlink_views TO authenticated;

-- Fix: Drop and recreate shortlinks_select_active policy with explicit roles
DROP POLICY IF EXISTS "shortlinks_select_active" ON public.shortlinks;
CREATE POLICY "shortlinks_select_active" ON public.shortlinks
  FOR SELECT TO authenticated, anon USING (is_active = true);
