-- Crypto Faucet Platform - Database Schema
-- Script 004: Create transactions table

CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Transaction details
  type transaction_type NOT NULL,
  status transaction_status DEFAULT 'pending' NOT NULL,
  amount_satoshis BIGINT NOT NULL,
  balance_before BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  
  -- References
  claim_id UUID REFERENCES public.claims(id) ON DELETE SET NULL,
  withdrawal_id UUID, -- Will reference withdrawals table
  referral_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Metadata
  description TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Idempotency
  idempotency_key TEXT UNIQUE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_transactions_type ON public.transactions(type);
CREATE INDEX idx_transactions_status ON public.transactions(status);
CREATE INDEX idx_transactions_created_at ON public.transactions(created_at DESC);
CREATE INDEX idx_transactions_claim_id ON public.transactions(claim_id);
CREATE INDEX idx_transactions_withdrawal_id ON public.transactions(withdrawal_id);
CREATE INDEX idx_transactions_idempotency_key ON public.transactions(idempotency_key);

-- Enable RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own transactions
CREATE POLICY "transactions_select_own" ON public.transactions
  FOR SELECT USING (auth.uid() = user_id);

-- System inserts transactions
CREATE POLICY "transactions_insert_system" ON public.transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can view all transactions
CREATE POLICY "transactions_admin_select" ON public.transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'superadmin', 'moderator')
    )
  );
