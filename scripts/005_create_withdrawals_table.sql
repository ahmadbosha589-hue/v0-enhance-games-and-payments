-- Crypto Faucet Platform - Database Schema
-- Script 005: Create withdrawals table

CREATE TABLE IF NOT EXISTS public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Withdrawal details
  amount_satoshis BIGINT NOT NULL CHECK (amount_satoshis > 0),
  fee_satoshis BIGINT DEFAULT 0 NOT NULL CHECK (fee_satoshis >= 0),
  net_amount_satoshis BIGINT NOT NULL CHECK (net_amount_satoshis > 0),
  
  -- Status
  status withdrawal_status DEFAULT 'pending' NOT NULL,
  
  -- Payment details
  payment_method TEXT DEFAULT 'faucetpay' NOT NULL,
  payment_address TEXT NOT NULL,
  payment_currency TEXT DEFAULT 'BTC' NOT NULL,
  
  -- FaucetPay response
  faucetpay_payout_id TEXT,
  faucetpay_response JSONB,
  
  -- Processing
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Fraud detection
  fraud_score INTEGER DEFAULT 0 NOT NULL CHECK (fraud_score >= 0 AND fraud_score <= 100),
  is_flagged BOOLEAN DEFAULT FALSE NOT NULL,
  flag_reason TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  
  -- Idempotency
  idempotency_key TEXT UNIQUE NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Constraints
  CONSTRAINT withdrawals_net_amount_check CHECK (
    net_amount_satoshis = amount_satoshis - fee_satoshis
  )
);

-- Add foreign key for transactions table
ALTER TABLE public.transactions 
ADD CONSTRAINT fk_transactions_withdrawal 
FOREIGN KEY (withdrawal_id) REFERENCES public.withdrawals(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX idx_withdrawals_user_id ON public.withdrawals(user_id);
CREATE INDEX idx_withdrawals_status ON public.withdrawals(status);
CREATE INDEX idx_withdrawals_created_at ON public.withdrawals(created_at DESC);
CREATE INDEX idx_withdrawals_is_flagged ON public.withdrawals(is_flagged) WHERE is_flagged = TRUE;
CREATE INDEX idx_withdrawals_faucetpay_payout_id ON public.withdrawals(faucetpay_payout_id);

-- Enable RLS
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own withdrawals
CREATE POLICY "withdrawals_select_own" ON public.withdrawals
  FOR SELECT USING (auth.uid() = user_id);

-- Users can request withdrawals
CREATE POLICY "withdrawals_insert_own" ON public.withdrawals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can view all withdrawals
CREATE POLICY "withdrawals_admin_select" ON public.withdrawals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'superadmin', 'moderator')
    )
  );

-- Admins can update withdrawals
CREATE POLICY "withdrawals_admin_update" ON public.withdrawals
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'superadmin')
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_withdrawals_updated_at
  BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
