-- Crypto Faucet Platform - Database Schema
-- Script 009: Create audit logs table

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Actor info
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role user_role,
  actor_ip INET,
  
  -- Action details
  action audit_action NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  
  -- Data
  old_data JSONB,
  new_data JSONB,
  metadata JSONB DEFAULT '{}',
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_audit_logs_actor_id ON public.audit_logs(actor_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only superadmins can view audit logs
CREATE POLICY "audit_logs_superadmin_select" ON public.audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role = 'superadmin'
    )
  );

-- Service role can insert audit logs
CREATE POLICY "audit_logs_service_insert" ON public.audit_logs
  FOR INSERT WITH CHECK (true);
