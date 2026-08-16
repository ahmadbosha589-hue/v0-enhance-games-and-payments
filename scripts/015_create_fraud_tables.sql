-- Fraud Attempts Table
-- Stores blocked and suspicious claim attempts for security analysis

CREATE TABLE IF NOT EXISTS fraud_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  fingerprint TEXT,
  risk_score INTEGER NOT NULL DEFAULT 0,
  suspicious_factors TEXT[] DEFAULT '{}',
  crypto_symbol TEXT,
  request_headers JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rate Limit Violations Table
-- Tracks rate limit violations for analysis and penalty escalation

CREATE TABLE IF NOT EXISTS rate_limit_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL,
  fingerprint TEXT,
  endpoint TEXT NOT NULL,
  method TEXT,
  user_agent TEXT,
  country TEXT,
  penalty_level INTEGER DEFAULT 0,
  reason TEXT,
  retry_after INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Blocked IPs Table
-- Stores blocked IP addresses

CREATE TABLE IF NOT EXISTS blocked_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL UNIQUE,
  reason TEXT,
  blocked_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_fraud_attempts_user_id ON fraud_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_attempts_ip_address ON fraud_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_fraud_attempts_created_at ON fraud_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_fraud_attempts_risk_score ON fraud_attempts(risk_score);

CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_user_id ON rate_limit_violations(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_ip_address ON rate_limit_violations(ip_address);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_created_at ON rate_limit_violations(created_at);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_endpoint ON rate_limit_violations(endpoint);

CREATE INDEX IF NOT EXISTS idx_blocked_ips_ip_address ON blocked_ips(ip_address);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_is_active ON blocked_ips(is_active);

-- Function to increment fraud score
CREATE OR REPLACE FUNCTION increment_fraud_score(
  p_user_id UUID,
  p_amount INTEGER DEFAULT 1
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_score INTEGER;
  new_score INTEGER;
BEGIN
  -- Get current fraud score
  SELECT COALESCE(fraud_score, 0) INTO current_score
  FROM profiles
  WHERE id = p_user_id;
  
  -- Calculate new score (capped at 100)
  new_score := LEAST(100, current_score + p_amount);
  
  -- Update the score
  UPDATE profiles
  SET 
    fraud_score = new_score,
    is_flagged = CASE WHEN new_score >= 50 THEN TRUE ELSE is_flagged END,
    updated_at = NOW()
  WHERE id = p_user_id;
  
  RETURN new_score;
END;
$$;

-- Function to reset daily rate limit violations
CREATE OR REPLACE FUNCTION cleanup_old_security_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete fraud attempts older than 30 days
  DELETE FROM fraud_attempts WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- Delete rate limit violations older than 7 days
  DELETE FROM rate_limit_violations WHERE created_at < NOW() - INTERVAL '7 days';
  
  -- Deactivate expired IP blocks
  UPDATE blocked_ips 
  SET is_active = FALSE 
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
  
  -- Decay fraud scores slowly (reduce by 1 per week for inactive users)
  UPDATE profiles
  SET fraud_score = GREATEST(0, fraud_score - 1)
  WHERE updated_at < NOW() - INTERVAL '7 days'
    AND fraud_score > 0;
END;
$$;

-- RLS Policies
ALTER TABLE fraud_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_ips ENABLE ROW LEVEL SECURITY;

-- Only admins can view fraud data
CREATE POLICY admin_fraud_attempts ON fraud_attempts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY admin_rate_limit_violations ON rate_limit_violations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY admin_blocked_ips ON blocked_ips
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Service role can always access for API operations
CREATE POLICY service_fraud_attempts ON fraud_attempts
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY service_rate_limit_violations ON rate_limit_violations
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY service_blocked_ips ON blocked_ips
  FOR ALL
  USING (auth.role() = 'service_role');
