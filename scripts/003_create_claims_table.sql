-- Crypto Faucet Platform - Database Schema
-- Script 003: Create claims table

CREATE TABLE IF NOT EXISTS public.claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Claim details
  amount_satoshis BIGINT NOT NULL CHECK (amount_satoshis > 0),
  base_amount_satoshis BIGINT NOT NULL CHECK (base_amount_satoshis > 0),
  streak_bonus_satoshis BIGINT DEFAULT 0 NOT NULL CHECK (streak_bonus_satoshis >= 0),
  referral_bonus_satoshis BIGINT DEFAULT 0 NOT NULL CHECK (referral_bonus_satoshis >= 0),
  
  -- Streak info at time of claim
  streak_day INTEGER DEFAULT 1 NOT NULL,
  
  -- Security tracking
  ip_address INET NOT NULL,
  user_agent TEXT,
  device_fingerprint TEXT,
  
  -- Fraud detection
  fraud_score INTEGER DEFAULT 0 NOT NULL CHECK (fraud_score >= 0 AND fraud_score <= 100),
  is_flagged BOOLEAN DEFAULT FALSE NOT NULL,
  flag_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Constraints
  CONSTRAINT claims_amount_check CHECK (
    amount_satoshis = base_amount_satoshis + streak_bonus_satoshis + referral_bonus_satoshis
  )
);

-- Indexes
CREATE INDEX idx_claims_user_id ON public.claims(user_id);
CREATE INDEX idx_claims_created_at ON public.claims(created_at DESC);
CREATE INDEX idx_claims_ip_address ON public.claims(ip_address);
CREATE INDEX idx_claims_device_fingerprint ON public.claims(device_fingerprint);
CREATE INDEX idx_claims_is_flagged ON public.claims(is_flagged) WHERE is_flagged = TRUE;
CREATE INDEX idx_claims_user_date ON public.claims(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own claims
CREATE POLICY "claims_select_own" ON public.claims
  FOR SELECT USING (auth.uid() = user_id);

-- Only system can insert claims (via server-side function)
CREATE POLICY "claims_insert_system" ON public.claims
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can view all claims
CREATE POLICY "claims_admin_select" ON public.claims
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'superadmin', 'moderator')
    )
  );

-- Admins can update claims (for flagging)
CREATE POLICY "claims_admin_update" ON public.claims
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'superadmin')
    )
  );
