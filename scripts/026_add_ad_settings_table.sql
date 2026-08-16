-- Create ad_settings table (run this if it doesn't exist)
CREATE TABLE IF NOT EXISTS public.ad_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'aads',
  enabled BOOLEAN NOT NULL DEFAULT false,
  aads_id TEXT,
  coinzilla_zone TEXT,
  bitsmedia_id TEXT,
  bitsmedia_slot TEXT,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  revenue_satoshis BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default ad positions
INSERT INTO public.ad_settings (position, provider, enabled) VALUES
  ('header', 'aads', false),
  ('sidebar', 'aads', false),
  ('content', 'aads', false),
  ('footer', 'aads', false),
  ('between-content', 'aads', false)
ON CONFLICT (position) DO NOTHING;

-- Disable RLS on ad_settings (admin-only table)
ALTER TABLE public.ad_settings DISABLE ROW LEVEL SECURITY;

-- Add admin select policy for audit_logs (allow admin/moderator to read)
DROP POLICY IF EXISTS audit_logs_superadmin_select ON audit_logs;
DROP POLICY IF EXISTS audit_logs_admin_select ON audit_logs;
CREATE POLICY audit_logs_admin_select ON audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin', 'moderator')
    )
  );
