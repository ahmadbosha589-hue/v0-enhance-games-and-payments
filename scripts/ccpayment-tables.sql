-- CCPayment Integration Tables

-- CCPayment Deposits
CREATE TABLE IF NOT EXISTS ccpayment_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_order_id TEXT NOT NULL UNIQUE,
  ccpayment_order_id TEXT,
  amount_usd DECIMAL(12, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  coin_id TEXT,
  chain TEXT,
  purpose TEXT DEFAULT 'balance' CHECK (purpose IN ('balance', 'advertising')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
  pay_address TEXT,
  payment_amount TEXT,
  tx_hash TEXT,
  expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CCPayment Withdrawals
CREATE TABLE IF NOT EXISTS ccpayment_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_order_id TEXT NOT NULL UNIQUE,
  ccpayment_order_id TEXT,
  amount_satoshis BIGINT NOT NULL,
  amount_crypto TEXT,
  coin_id TEXT NOT NULL,
  chain TEXT NOT NULL,
  address TEXT NOT NULL,
  memo TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  tx_hash TEXT,
  fee TEXT,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CCPayment Swaps
CREATE TABLE IF NOT EXISTS ccpayment_swaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_order_id TEXT NOT NULL UNIQUE,
  ccpayment_order_id TEXT,
  from_coin_id TEXT NOT NULL,
  to_coin_id TEXT NOT NULL,
  from_amount TEXT NOT NULL,
  to_amount TEXT,
  rate TEXT,
  fee TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  tx_hash TEXT,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add advertising balance to profiles (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'ad_balance_usd') THEN
    ALTER TABLE profiles ADD COLUMN ad_balance_usd DECIMAL(12, 2) DEFAULT 0;
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ccpayment_deposits_user ON ccpayment_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_ccpayment_deposits_status ON ccpayment_deposits(status);
CREATE INDEX IF NOT EXISTS idx_ccpayment_deposits_merchant_order ON ccpayment_deposits(merchant_order_id);

CREATE INDEX IF NOT EXISTS idx_ccpayment_withdrawals_user ON ccpayment_withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_ccpayment_withdrawals_status ON ccpayment_withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_ccpayment_withdrawals_merchant_order ON ccpayment_withdrawals(merchant_order_id);

CREATE INDEX IF NOT EXISTS idx_ccpayment_swaps_user ON ccpayment_swaps(user_id);
CREATE INDEX IF NOT EXISTS idx_ccpayment_swaps_status ON ccpayment_swaps(status);

-- RLS Policies
ALTER TABLE ccpayment_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE ccpayment_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ccpayment_swaps ENABLE ROW LEVEL SECURITY;

-- Users can view their own records
CREATE POLICY "Users can view own deposits" ON ccpayment_deposits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own withdrawals" ON ccpayment_withdrawals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own swaps" ON ccpayment_swaps FOR SELECT USING (auth.uid() = user_id);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_ccpayment_deposits_updated_at BEFORE UPDATE ON ccpayment_deposits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ccpayment_withdrawals_updated_at BEFORE UPDATE ON ccpayment_withdrawals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ccpayment_swaps_updated_at BEFORE UPDATE ON ccpayment_swaps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
