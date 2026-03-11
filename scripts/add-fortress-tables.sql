-- =============================================================================
-- SERVER FORTRESS v4.0 - DATABASE SCHEMA ADDITIONS
-- =============================================================================
-- Adds tables for enhanced VPN and adblock detection tracking
-- =============================================================================

-- IP Reputation Cache Table
-- Stores VPN/proxy detection results for fast lookups
CREATE TABLE IF NOT EXISTS ip_reputation_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address VARCHAR(45) UNIQUE NOT NULL,
  is_vpn BOOLEAN DEFAULT FALSE,
  is_proxy BOOLEAN DEFAULT FALSE,
  is_tor BOOLEAN DEFAULT FALSE,
  is_datacenter BOOLEAN DEFAULT FALSE,
  confidence INTEGER DEFAULT 0,
  risk_score INTEGER DEFAULT 0,
  provider VARCHAR(255),
  country VARCHAR(10),
  city VARCHAR(255),
  isp VARCHAR(255),
  asn VARCHAR(50),
  methods TEXT[] DEFAULT '{}',
  consensus_data JSONB DEFAULT '{}',
  last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast IP lookups
CREATE INDEX IF NOT EXISTS idx_ip_reputation_cache_ip ON ip_reputation_cache(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_reputation_cache_last_checked ON ip_reputation_cache(last_checked_at);

-- VPN Detection Log Table
-- Logs all VPN detection events for audit and analytics
CREATE TABLE IF NOT EXISTS vpn_detection_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address VARCHAR(45) NOT NULL,
  is_vpn BOOLEAN DEFAULT FALSE,
  is_proxy BOOLEAN DEFAULT FALSE,
  is_tor BOOLEAN DEFAULT FALSE,
  is_datacenter BOOLEAN DEFAULT FALSE,
  confidence INTEGER DEFAULT 0,
  risk_score INTEGER DEFAULT 0,
  risk_level VARCHAR(20) DEFAULT 'none',
  should_block BOOLEAN DEFAULT FALSE,
  methods TEXT[] DEFAULT '{}',
  consensus JSONB DEFAULT '{}',
  details JSONB DEFAULT '{}',
  factors JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for VPN detection log
CREATE INDEX IF NOT EXISTS idx_vpn_detection_log_user ON vpn_detection_log(user_id);
CREATE INDEX IF NOT EXISTS idx_vpn_detection_log_ip ON vpn_detection_log(ip_address);
CREATE INDEX IF NOT EXISTS idx_vpn_detection_log_created ON vpn_detection_log(created_at);
CREATE INDEX IF NOT EXISTS idx_vpn_detection_log_risk ON vpn_detection_log(risk_level);

-- User Activity Log Table
-- Tracks user activity for behavioral analysis
CREATE TABLE IF NOT EXISTS user_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address VARCHAR(45),
  user_agent TEXT,
  action_type VARCHAR(100) NOT NULL,
  action_details JSONB DEFAULT '{}',
  request_path VARCHAR(500),
  session_id VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for activity log
CREATE INDEX IF NOT EXISTS idx_user_activity_log_user ON user_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_created ON user_activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_ip ON user_activity_log(ip_address);

-- Add new columns to profiles if they don't exist
DO $$ 
BEGIN
  -- VPN detection columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'vpn_detected_at') THEN
    ALTER TABLE profiles ADD COLUMN vpn_detected_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'vpn_detection_confidence') THEN
    ALTER TABLE profiles ADD COLUMN vpn_detection_confidence INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'vpn_detection_methods') THEN
    ALTER TABLE profiles ADD COLUMN vpn_detection_methods TEXT[] DEFAULT '{}';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_vpn_ip') THEN
    ALTER TABLE profiles ADD COLUMN last_vpn_ip VARCHAR(45);
  END IF;
  
  -- Adblock detection columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'adblock_verification_score') THEN
    ALTER TABLE profiles ADD COLUMN adblock_verification_score INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add new columns to adblock_analytics if needed
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adblock_analytics' AND column_name = 'methods') THEN
    ALTER TABLE adblock_analytics ADD COLUMN methods TEXT[] DEFAULT '{}';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adblock_analytics' AND column_name = 'factors') THEN
    ALTER TABLE adblock_analytics ADD COLUMN factors JSONB DEFAULT '{}';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adblock_analytics' AND column_name = 'should_block') THEN
    ALTER TABLE adblock_analytics ADD COLUMN should_block BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adblock_analytics' AND column_name = 'risk_level') THEN
    ALTER TABLE adblock_analytics ADD COLUMN risk_level VARCHAR(20) DEFAULT 'none';
  END IF;
END $$;

-- Create a function to clean up old IP reputation cache entries
CREATE OR REPLACE FUNCTION cleanup_old_ip_cache()
RETURNS void AS $$
BEGIN
  -- Delete entries older than 7 days
  DELETE FROM ip_reputation_cache 
  WHERE last_checked_at < NOW() - INTERVAL '7 days';
  
  -- Delete old activity logs (keep 30 days)
  DELETE FROM user_activity_log 
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- Delete old VPN detection logs (keep 90 days)
  DELETE FROM vpn_detection_log 
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Create RLS policies for security
ALTER TABLE ip_reputation_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE vpn_detection_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;

-- Only service role can access IP reputation cache
CREATE POLICY IF NOT EXISTS ip_reputation_cache_service_only ON ip_reputation_cache
  FOR ALL USING (auth.role() = 'service_role');

-- Users can only see their own VPN detection logs
CREATE POLICY IF NOT EXISTS vpn_detection_log_user_select ON vpn_detection_log
  FOR SELECT USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY IF NOT EXISTS vpn_detection_log_service_insert ON vpn_detection_log
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Users can only see their own activity logs
CREATE POLICY IF NOT EXISTS user_activity_log_user_select ON user_activity_log
  FOR SELECT USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY IF NOT EXISTS user_activity_log_service_insert ON user_activity_log
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Grant permissions to authenticated users
GRANT SELECT ON ip_reputation_cache TO authenticated;
GRANT SELECT ON vpn_detection_log TO authenticated;
GRANT SELECT ON user_activity_log TO authenticated;

-- Service role gets full access
GRANT ALL ON ip_reputation_cache TO service_role;
GRANT ALL ON vpn_detection_log TO service_role;
GRANT ALL ON user_activity_log TO service_role;
