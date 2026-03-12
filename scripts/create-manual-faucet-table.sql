-- Create manual_faucet_claims table for tracking multi-crypto faucet claims
CREATE TABLE IF NOT EXISTS manual_faucet_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  crypto_symbol VARCHAR(10) NOT NULL,
  amount DECIMAL(20, 8) NOT NULL,
  usd_value DECIMAL(10, 6) NOT NULL DEFAULT 0.0001,
  ip_address VARCHAR(45),
  fingerprint VARCHAR(255),
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed
  faucetpay_tx_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_manual_faucet_user_id ON manual_faucet_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_manual_faucet_claimed_at ON manual_faucet_claims(claimed_at);
CREATE INDEX IF NOT EXISTS idx_manual_faucet_crypto_symbol ON manual_faucet_claims(crypto_symbol);
CREATE INDEX IF NOT EXISTS idx_manual_faucet_ip_address ON manual_faucet_claims(ip_address);
CREATE INDEX IF NOT EXISTS idx_manual_faucet_user_crypto ON manual_faucet_claims(user_id, crypto_symbol);
CREATE INDEX IF NOT EXISTS idx_manual_faucet_user_claimed ON manual_faucet_claims(user_id, claimed_at);

-- Enable Row Level Security
ALTER TABLE manual_faucet_claims ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own claims
CREATE POLICY "Users can view own manual faucet claims" ON manual_faucet_claims
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role can insert
CREATE POLICY "Service role can insert manual faucet claims" ON manual_faucet_claims
  FOR INSERT
  WITH CHECK (true);

-- Policy: Service role can update
CREATE POLICY "Service role can update manual faucet claims" ON manual_faucet_claims
  FOR UPDATE
  USING (true);

-- Grant permissions
GRANT SELECT ON manual_faucet_claims TO authenticated;
GRANT ALL ON manual_faucet_claims TO service_role;
