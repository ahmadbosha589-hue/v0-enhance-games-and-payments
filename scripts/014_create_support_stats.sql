-- Support Stats Table for tracking ad watching and support earnings
-- Used for Support Champion tournaments

-- Create support_stats table if it doesn't exist
CREATE TABLE IF NOT EXISTS support_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ads_watched_today INTEGER DEFAULT 0,
  total_ads_watched INTEGER DEFAULT 0,
  total_support_earnings BIGINT DEFAULT 0,
  last_ad_watched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_support_stats_user_id ON support_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_support_stats_updated_at ON support_stats(updated_at);
CREATE INDEX IF NOT EXISTS idx_support_stats_ads_watched ON support_stats(total_ads_watched DESC);
CREATE INDEX IF NOT EXISTS idx_support_stats_earnings ON support_stats(total_support_earnings DESC);

-- Create double_reward_claims table if it doesn't exist
CREATE TABLE IF NOT EXISTS double_reward_claims (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crypto_symbol TEXT NOT NULL,
  base_amount DOUBLE PRECISION NOT NULL,
  double_amount DOUBLE PRECISION NOT NULL,
  ads_watched INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for double_reward_claims
CREATE INDEX IF NOT EXISTS idx_double_reward_claims_user_id ON double_reward_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_double_reward_claims_created_at ON double_reward_claims(created_at);

-- Enable RLS
ALTER TABLE support_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE double_reward_claims ENABLE ROW LEVEL SECURITY;

-- RLS policies for support_stats (users can read their own, admins can read all)
DROP POLICY IF EXISTS "Users can view their own support stats" ON support_stats;
CREATE POLICY "Users can view their own support stats" ON support_stats
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage support stats" ON support_stats;
CREATE POLICY "Service role can manage support stats" ON support_stats
  FOR ALL USING (true);

-- RLS policies for double_reward_claims
DROP POLICY IF EXISTS "Users can view their own double reward claims" ON double_reward_claims;
CREATE POLICY "Users can view their own double reward claims" ON double_reward_claims
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage double reward claims" ON double_reward_claims;
CREATE POLICY "Service role can manage double reward claims" ON double_reward_claims
  FOR ALL USING (true);

-- Function to reset daily ads watched count (run daily at midnight UTC)
CREATE OR REPLACE FUNCTION reset_daily_support_stats()
RETURNS void AS $$
BEGIN
  UPDATE support_stats SET ads_watched_today = 0 WHERE ads_watched_today > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
