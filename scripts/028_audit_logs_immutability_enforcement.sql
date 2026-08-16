-- =====================================================
-- Script 028: Enforce Audit Logs Immutability
-- Ensures audit logs cannot be modified or deleted
-- =====================================================

-- Drop existing policies to ensure clean state
DROP POLICY IF EXISTS "audit_logs_superadmin_select" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_service_insert" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins can read all audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "No updates allowed on audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "No deletes allowed on audit logs" ON public.audit_logs;

-- Enable RLS (ensure it's on)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy 1: Admins and moderators can read all audit logs
CREATE POLICY "audit_logs_admin_select" ON public.audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'superadmin', 'moderator')
    )
  );

-- Policy 2: Allow inserts (authenticated users and service role)
CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT
  WITH CHECK (true);

-- Policy 3: DENY ALL updates - audit logs are immutable
-- Using "USING (false)" ensures no rows can ever match for update
CREATE POLICY "audit_logs_no_update" ON public.audit_logs
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

-- Policy 4: DENY ALL deletes - audit logs are permanent
CREATE POLICY "audit_logs_no_delete" ON public.audit_logs
  FOR DELETE
  USING (false);

-- Add database-level trigger to prevent updates (defense in depth)
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable and cannot be modified';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS prevent_audit_log_update ON public.audit_logs;
DROP TRIGGER IF EXISTS prevent_audit_log_delete ON public.audit_logs;

-- Create triggers for defense in depth
CREATE TRIGGER prevent_audit_log_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();

CREATE TRIGGER prevent_audit_log_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();

-- Add comment for documentation
COMMENT ON TABLE public.audit_logs IS 'IMMUTABLE audit trail for all admin actions. Protected by RLS policies and triggers. NO updates or deletes are permitted.';

-- Create index for faster admin lookups
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_action_created 
  ON public.audit_logs(actor_id, action, created_at DESC);

-- Create index for resource-based lookups
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_created 
  ON public.audit_logs(resource_type, resource_id, created_at DESC);
