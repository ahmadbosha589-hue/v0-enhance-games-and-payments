-- Migration: Enhance audit logs for better admin accountability
-- This script ensures proper indexes and adds any missing columns

-- Ensure indexes exist for faster querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Create composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_action ON audit_logs(actor_id, action);

-- Ensure RLS is enabled but allows admin read access
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Admins can read all audit logs" ON audit_logs;
DROP POLICY IF EXISTS "System can insert audit logs" ON audit_logs;
DROP POLICY IF EXISTS "No updates allowed on audit logs" ON audit_logs;
DROP POLICY IF EXISTS "No deletes allowed on audit logs" ON audit_logs;

-- Admins can read all audit logs
CREATE POLICY "Admins can read all audit logs" ON audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'superadmin', 'moderator')
    )
  );

-- Allow inserts from authenticated users (system actions)
CREATE POLICY "System can insert audit logs" ON audit_logs
  FOR INSERT
  WITH CHECK (true);

-- Prevent any updates to audit logs (immutability)
CREATE POLICY "No updates allowed on audit logs" ON audit_logs
  FOR UPDATE
  USING (false);

-- Prevent any deletes from audit logs (immutability)
CREATE POLICY "No deletes allowed on audit logs" ON audit_logs
  FOR DELETE
  USING (false);

-- Add comment for documentation
COMMENT ON TABLE audit_logs IS 'Immutable audit trail for all admin actions. No updates or deletes allowed.';
