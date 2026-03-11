-- Crypto Faucet Platform - Database Schema
-- Script 006: Create fraud flags table

CREATE TABLE IF NOT EXISTS public.fraud_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Flag details
  status fraud_flag_status DEFAULT 'pending_review' NOT NULL,
  fraud_type TEXT NOT NULL,
  severity INTEGER NOT NULL CHECK (severity >= 1 AND severity <= 10),
  
  -- Evidence
  evidence JSONB NOT NULL DEFAULT '{}',
  ip_addresses INET[] DEFAULT '{}',
  device_fingerprints TEXT[] DEFAULT '{}',
  
  -- Related entities
  related_user_ids UUID[] DEFAULT '{}',
  related_claim_ids UUID[] DEFAULT '{}',
  related_withdrawal_ids UUID[] DEFAULT '{}',
  
  -- Resolution
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  action_taken TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_fraud_flags_user_id ON public.fraud_flags(user_id);
CREATE INDEX idx_fraud_flags_status ON public.fraud_flags(status);
CREATE INDEX idx_fraud_flags_severity ON public.fraud_flags(severity DESC);
CREATE INDEX idx_fraud_flags_created_at ON public.fraud_flags(created_at DESC);
CREATE INDEX idx_fraud_flags_fraud_type ON public.fraud_flags(fraud_type);

-- Enable RLS
ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;

-- Only admins can view fraud flags
CREATE POLICY "fraud_flags_admin_select" ON public.fraud_flags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'superadmin', 'moderator')
    )
  );

-- Only admins can insert fraud flags
CREATE POLICY "fraud_flags_admin_insert" ON public.fraud_flags
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'superadmin', 'moderator')
    )
  );

-- Only admins can update fraud flags
CREATE POLICY "fraud_flags_admin_update" ON public.fraud_flags
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'superadmin')
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_fraud_flags_updated_at
  BEFORE UPDATE ON public.fraud_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
