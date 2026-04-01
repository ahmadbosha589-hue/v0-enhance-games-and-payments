-- =============================================================================
-- SECURITY TABLES MIGRATION v2.0
-- Adds necessary tables for enhanced security system
-- =============================================================================

-- Rate limit violations tracking
CREATE TABLE IF NOT EXISTS rate_limit_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ip_address TEXT NOT NULL,
  fingerprint TEXT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  user_agent TEXT,
  country TEXT,
  penalty_level INTEGER DEFAULT 0,
  reason TEXT,
  retry_after INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_user_id ON rate_limit_violations(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_ip ON rate_limit_violations(ip_address);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_created_at ON rate_limit_violations(created_at);

-- User activity tracking for session analysis
CREATE TABLE IF NOT EXISTS user_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL,
  fingerprint TEXT,
  user_agent TEXT,
  activity_type TEXT NOT NULL,
  endpoint TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_ip ON user_activity(ip_address);
CREATE INDEX IF NOT EXISTS idx_user_activity_created_at ON user_activity(created_at);
CREATE INDEX IF NOT EXISTS idx_user_activity_fingerprint ON user_activity(fingerprint) WHERE fingerprint IS NOT NULL;

-- Login history for geographic analysis
CREATE TABLE IF NOT EXISTS login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL,
  country TEXT,
  city TEXT,
  region TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  isp TEXT,
  asn TEXT,
  is_vpn BOOLEAN DEFAULT FALSE,
  is_proxy BOOLEAN DEFAULT FALSE,
  is_tor BOOLEAN DEFAULT FALSE,
  user_agent TEXT,
  fingerprint TEXT,
  login_method TEXT DEFAULT 'email',
  success BOOLEAN DEFAULT TRUE,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_ip ON login_history(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_history_created_at ON login_history(created_at);
CREATE INDEX IF NOT EXISTS idx_login_history_country ON login_history(country) WHERE country IS NOT NULL;

-- PTC views tracking
CREATE TABLE IF NOT EXISTS ptc_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  ad_id UUID NOT NULL,
  view_duration INTEGER NOT NULL, -- seconds
  ip_address TEXT NOT NULL,
  fingerprint TEXT,
  reward_satoshis BIGINT DEFAULT 0,
  is_valid BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ptc_views_user_id ON ptc_views(user_id);
CREATE INDEX IF NOT EXISTS idx_ptc_views_ad_id ON ptc_views(ad_id);
CREATE INDEX IF NOT EXISTS idx_ptc_views_created_at ON ptc_views(created_at);

-- Shortlink visits tracking
CREATE TABLE IF NOT EXISTS shortlink_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  shortlink_id UUID NOT NULL,
  ip_address TEXT NOT NULL,
  fingerprint TEXT,
  reward_satoshis BIGINT DEFAULT 0,
  is_valid BOOLEAN DEFAULT TRUE,
  steps_completed INTEGER DEFAULT 0,
  total_steps INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shortlink_visits_user_id ON shortlink_visits(user_id);
CREATE INDEX IF NOT EXISTS idx_shortlink_visits_created_at ON shortlink_visits(created_at);

-- Add columns to profiles if they don't exist
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fraud_score INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS signup_ip TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Create index for fraud score queries
CREATE INDEX IF NOT EXISTS idx_profiles_fraud_score ON profiles(fraud_score) WHERE fraud_score > 0;

-- Function to increment fraud score
CREATE OR REPLACE FUNCTION increment_fraud_score(
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_score INTEGER;
BEGIN
  UPDATE profiles
  SET fraud_score = LEAST(100, COALESCE(fraud_score, 0) + p_amount)
  WHERE id = p_user_id
  RETURNING fraud_score INTO v_new_score;
  
  RETURN v_new_score;
END;
$$;

-- Function to decay fraud scores (run periodically)
CREATE OR REPLACE FUNCTION decay_fraud_scores()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  UPDATE profiles
  SET fraud_score = GREATEST(0, fraud_score - 1)
  WHERE fraud_score > 0
    AND last_active_at < NOW() - INTERVAL '24 hours';
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$;

-- Fraud flags table enhancements
ALTER TABLE fraud_flags ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'detected';
ALTER TABLE fraud_flags ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE fraud_flags ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE fraud_flags ADD COLUMN IF NOT EXISTS resolution TEXT;

-- Create indexes for fraud flags
CREATE INDEX IF NOT EXISTS idx_fraud_flags_status ON fraud_flags(status);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_severity ON fraud_flags(severity);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_flag_type ON fraud_flags(flag_type);

-- Device fingerprints enhancements
ALTER TABLE device_fingerprints ADD COLUMN IF NOT EXISTS trust_score INTEGER DEFAULT 50;
ALTER TABLE device_fingerprints ADD COLUMN IF NOT EXISTS times_seen INTEGER DEFAULT 1;
ALTER TABLE device_fingerprints ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();

-- Update device fingerprint on use
CREATE OR REPLACE FUNCTION update_device_fingerprint_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE device_fingerprints
  SET times_seen = times_seen + 1,
      last_seen_at = NOW()
  WHERE fingerprint_hash = NEW.fingerprint
    AND user_id = NEW.user_id;
  
  RETURN NEW;
END;
$$;

-- Enable RLS on new tables
ALTER TABLE rate_limit_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ptc_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE shortlink_visits ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can only see their own data
CREATE POLICY "Users can view own rate limit violations"
  ON rate_limit_violations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own activity"
  ON user_activity FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own login history"
  ON login_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own PTC views"
  ON ptc_views FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own shortlink visits"
  ON shortlink_visits FOR SELECT
  USING (auth.uid() = user_id);

-- Admin policies (service role can do everything)
CREATE POLICY "Service role has full access to rate_limit_violations"
  ON rate_limit_violations FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to user_activity"
  ON user_activity FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to login_history"
  ON login_history FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to ptc_views"
  ON ptc_views FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to shortlink_visits"
  ON shortlink_visits FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Grant necessary permissions
GRANT ALL ON rate_limit_violations TO service_role;
GRANT ALL ON user_activity TO service_role;
GRANT ALL ON login_history TO service_role;
GRANT ALL ON ptc_views TO service_role;
GRANT ALL ON shortlink_visits TO service_role;

GRANT SELECT ON rate_limit_violations TO authenticated;
GRANT SELECT ON user_activity TO authenticated;
GRANT SELECT ON login_history TO authenticated;
GRANT SELECT ON ptc_views TO authenticated;
GRANT SELECT ON shortlink_visits TO authenticated;
