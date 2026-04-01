-- =====================================================
-- Referral Fraud Detection System v2.0
-- Multi-layer protection against self-referrals
-- =====================================================

-- Create referral clicks table for tracking link clicks
CREATE TABLE IF NOT EXISTS referral_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code TEXT NOT NULL,
  referrer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  converted_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_converted BOOLEAN DEFAULT FALSE,
  clicked_at TIMESTAMPTZ DEFAULT NOW(),
  converted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_referral_clicks_code ON referral_clicks(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_referrer ON referral_clicks(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_ip ON referral_clicks(ip_address);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_time ON referral_clicks(clicked_at DESC);

-- Add new columns to profiles for referral fraud tracking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_fraud_score INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_blocked_count INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_referral_fraud_at TIMESTAMPTZ;

-- Create index for faster referral lookups
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON profiles(referred_by);
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_profiles_signup_ip ON profiles(signup_ip);

-- Create referral fraud tracking table
CREATE TABLE IF NOT EXISTS referral_fraud_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  new_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Detection results
  is_blocked BOOLEAN DEFAULT FALSE,
  confidence INTEGER DEFAULT 0,
  risk_level TEXT DEFAULT 'none' CHECK (risk_level IN ('none', 'low', 'medium', 'high', 'critical')),
  evidence_score INTEGER DEFAULT 0,
  matched_layers INTEGER[] DEFAULT '{}',
  
  -- Evidence details
  reasons TEXT[] DEFAULT '{}',
  identity_match JSONB DEFAULT '{}',
  device_match JSONB DEFAULT '{}',
  network_match JSONB DEFAULT '{}',
  behavioral_match JSONB DEFAULT '{}',
  graph_match JSONB DEFAULT '{}',
  
  -- Metadata
  signup_ip TEXT,
  fingerprint_hash TEXT,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id),
  review_notes TEXT
);

-- Indexes for fraud detections
CREATE INDEX IF NOT EXISTS idx_referral_fraud_new_user ON referral_fraud_detections(new_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_fraud_referrer ON referral_fraud_detections(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_fraud_blocked ON referral_fraud_detections(is_blocked);
CREATE INDEX IF NOT EXISTS idx_referral_fraud_risk_level ON referral_fraud_detections(risk_level);
CREATE INDEX IF NOT EXISTS idx_referral_fraud_created ON referral_fraud_detections(created_at DESC);

-- Create referral network graph table for tracking relationships
CREATE TABLE IF NOT EXISTS referral_network_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL DEFAULT 'referral', -- 'referral', 'same_device', 'same_ip', 'suspected'
  confidence INTEGER DEFAULT 100,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(from_user_id, to_user_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_referral_network_from ON referral_network_edges(from_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_network_to ON referral_network_edges(to_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_network_type ON referral_network_edges(edge_type);

-- Function to increment referral count atomically
CREATE OR REPLACE FUNCTION increment_referral_count(p_referrer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET 
    referral_count = COALESCE(referral_count, 0) + 1,
    updated_at = NOW()
  WHERE id = p_referrer_id;
END;
$$;

-- Function to check for self-referral patterns
CREATE OR REPLACE FUNCTION check_self_referral_patterns(
  p_new_user_id UUID,
  p_referrer_id UUID,
  p_signup_ip TEXT DEFAULT NULL,
  p_fingerprint TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB := '{"is_suspicious": false, "reasons": [], "score": 0}'::JSONB;
  v_referrer profiles%ROWTYPE;
  v_new_user profiles%ROWTYPE;
  v_score INTEGER := 0;
  v_reasons TEXT[] := '{}';
  v_same_ip_count INTEGER;
  v_same_device_count INTEGER;
  v_circular BOOLEAN := FALSE;
  v_chain_ids UUID[];
BEGIN
  -- Get both profiles
  SELECT * INTO v_referrer FROM profiles WHERE id = p_referrer_id;
  SELECT * INTO v_new_user FROM profiles WHERE id = p_new_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('is_suspicious', true, 'reasons', ARRAY['Profile not found'], 'score', 100);
  END IF;
  
  -- Check 1: Same IP address
  IF p_signup_ip IS NOT NULL AND v_referrer.signup_ip = p_signup_ip THEN
    v_score := v_score + 60;
    v_reasons := array_append(v_reasons, 'Same signup IP as referrer');
  END IF;
  
  -- Check 2: Same IP in last login
  IF p_signup_ip IS NOT NULL AND v_referrer.last_login_ip = p_signup_ip THEN
    v_score := v_score + 40;
    v_reasons := array_append(v_reasons, 'Same IP as referrer last login');
  END IF;
  
  -- Check 3: Same device fingerprint
  IF p_fingerprint IS NOT NULL THEN
    SELECT COUNT(*) INTO v_same_device_count
    FROM device_fingerprints
    WHERE fingerprint_hash = p_fingerprint
      AND user_id = p_referrer_id;
    
    IF v_same_device_count > 0 THEN
      v_score := v_score + 80;
      v_reasons := array_append(v_reasons, 'Same device fingerprint as referrer');
    END IF;
  END IF;
  
  -- Check 4: Multiple accounts from same IP
  IF p_signup_ip IS NOT NULL THEN
    SELECT COUNT(*) INTO v_same_ip_count
    FROM profiles
    WHERE signup_ip = p_signup_ip
      AND id != p_new_user_id
      AND created_at > NOW() - INTERVAL '24 hours';
    
    IF v_same_ip_count >= 3 THEN
      v_score := v_score + 50;
      v_reasons := array_append(v_reasons, v_same_ip_count || ' accounts from same IP in 24h');
    ELSIF v_same_ip_count >= 2 THEN
      v_score := v_score + 25;
      v_reasons := array_append(v_reasons, v_same_ip_count || ' accounts from same IP in 24h');
    END IF;
  END IF;
  
  -- Check 5: Circular referral chain
  WITH RECURSIVE referral_chain AS (
    SELECT id, referred_by, ARRAY[id] AS chain, 1 AS depth
    FROM profiles
    WHERE id = p_referrer_id
    
    UNION ALL
    
    SELECT p.id, p.referred_by, rc.chain || p.id, rc.depth + 1
    FROM profiles p
    JOIN referral_chain rc ON p.id = rc.referred_by
    WHERE rc.depth < 10 
      AND NOT p.id = ANY(rc.chain)
  )
  SELECT 
    p_new_user_id = ANY(chain),
    chain
  INTO v_circular, v_chain_ids
  FROM referral_chain
  WHERE referred_by IS NOT NULL
  ORDER BY depth DESC
  LIMIT 1;
  
  IF v_circular THEN
    v_score := v_score + 100;
    v_reasons := array_append(v_reasons, 'Circular referral chain detected');
  END IF;
  
  -- Check 6: Referrer has high fraud score
  IF v_referrer.fraud_score >= 50 THEN
    v_score := v_score + 30;
    v_reasons := array_append(v_reasons, 'Referrer has high fraud score: ' || v_referrer.fraud_score);
  END IF;
  
  -- Check 7: Referrer has many blocked referrals
  IF v_referrer.referral_blocked_count >= 3 THEN
    v_score := v_score + 40;
    v_reasons := array_append(v_reasons, 'Referrer has ' || v_referrer.referral_blocked_count || ' blocked referrals');
  END IF;
  
  -- Check 8: Email pattern similarity (same domain + similar local part)
  IF v_referrer.email IS NOT NULL AND v_new_user.email IS NOT NULL THEN
    IF split_part(v_referrer.email, '@', 2) = split_part(v_new_user.email, '@', 2) THEN
      -- Same email domain
      v_score := v_score + 20;
      v_reasons := array_append(v_reasons, 'Same email domain');
      
      -- Check for sequential pattern (e.g., user1@, user2@)
      IF regexp_replace(split_part(v_referrer.email, '@', 1), '[0-9]+', '', 'g') =
         regexp_replace(split_part(v_new_user.email, '@', 1), '[0-9]+', '', 'g') THEN
        v_score := v_score + 30;
        v_reasons := array_append(v_reasons, 'Sequential email pattern');
      END IF;
    END IF;
  END IF;
  
  -- Build result
  v_result := jsonb_build_object(
    'is_suspicious', v_score >= 60,
    'should_block', v_score >= 100,
    'reasons', v_reasons,
    'score', v_score,
    'checks', jsonb_build_object(
      'same_ip', p_signup_ip IS NOT NULL AND v_referrer.signup_ip = p_signup_ip,
      'circular_chain', v_circular,
      'same_device', v_same_device_count > 0,
      'high_fraud_referrer', v_referrer.fraud_score >= 50
    )
  );
  
  -- Log suspicious activity
  IF v_score >= 60 THEN
    INSERT INTO referral_fraud_detections (
      new_user_id, referrer_id, is_blocked, confidence, 
      risk_level, evidence_score, reasons, signup_ip, fingerprint_hash
    ) VALUES (
      p_new_user_id, p_referrer_id, v_score >= 100, v_score,
      CASE 
        WHEN v_score >= 150 THEN 'critical'
        WHEN v_score >= 100 THEN 'high'
        WHEN v_score >= 60 THEN 'medium'
        ELSE 'low'
      END,
      v_score, v_reasons, p_signup_ip, p_fingerprint
    );
  END IF;
  
  RETURN v_result;
END;
$$;

-- Function to process referral with fraud check
CREATE OR REPLACE FUNCTION process_referral_with_fraud_check(
  p_new_user_id UUID,
  p_referral_code TEXT,
  p_signup_ip TEXT DEFAULT NULL,
  p_fingerprint TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_referrer profiles%ROWTYPE;
  v_fraud_check JSONB;
  v_result JSONB;
BEGIN
  -- Find referrer by code
  SELECT * INTO v_referrer 
  FROM profiles 
  WHERE referral_code = UPPER(p_referral_code)
    AND status != 'banned'
    AND is_banned != TRUE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_REFERRAL_CODE');
  END IF;
  
  -- Cannot self-refer
  IF v_referrer.id = p_new_user_id THEN
    -- Immediate ban for direct self-referral attempt
    UPDATE profiles SET
      fraud_score = 100,
      is_banned = TRUE,
      ban_reason = 'Self-referral attempt',
      status = 'banned'
    WHERE id = p_new_user_id;
    
    RETURN jsonb_build_object('success', false, 'error', 'SELF_REFERRAL_BLOCKED', 'banned', true);
  END IF;
  
  -- Run fraud detection
  v_fraud_check := check_self_referral_patterns(p_new_user_id, v_referrer.id, p_signup_ip, p_fingerprint);
  
  IF (v_fraud_check->>'should_block')::BOOLEAN THEN
    -- Block the referral
    UPDATE profiles SET
      fraud_score = LEAST(100, fraud_score + (v_fraud_check->>'score')::INTEGER / 2),
      referral_fraud_score = (v_fraud_check->>'score')::INTEGER
    WHERE id = p_new_user_id;
    
    -- Track blocked referral on referrer
    UPDATE profiles SET
      referral_blocked_count = COALESCE(referral_blocked_count, 0) + 1,
      last_referral_fraud_at = NOW()
    WHERE id = v_referrer.id;
    
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'REFERRAL_FRAUD_DETECTED',
      'fraud_check', v_fraud_check
    );
  END IF;
  
  -- Apply the referral
  UPDATE profiles SET
    referred_by = v_referrer.id
  WHERE id = p_new_user_id;
  
  -- Increment referrer count
  UPDATE profiles SET
    referral_count = COALESCE(referral_count, 0) + 1
  WHERE id = v_referrer.id;
  
  -- Create network edge
  INSERT INTO referral_network_edges (from_user_id, to_user_id, edge_type, confidence)
  VALUES (v_referrer.id, p_new_user_id, 'referral', 100)
  ON CONFLICT (from_user_id, to_user_id, edge_type) DO NOTHING;
  
  RETURN jsonb_build_object(
    'success', true,
    'referrer_id', v_referrer.id,
    'fraud_check', v_fraud_check
  );
END;
$$;

-- Function to detect referral clusters (bot networks)
CREATE OR REPLACE FUNCTION detect_referral_clusters(p_referrer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_referral_count INTEGER;
  v_unique_ips INTEGER;
  v_unique_devices INTEGER;
  v_banned_referrals INTEGER;
  v_rapid_registrations INTEGER;
  v_cluster_score INTEGER := 0;
  v_is_cluster BOOLEAN := FALSE;
BEGIN
  -- Count referrals
  SELECT COUNT(*) INTO v_referral_count
  FROM profiles WHERE referred_by = p_referrer_id;
  
  IF v_referral_count < 3 THEN
    RETURN jsonb_build_object('is_cluster', false, 'referral_count', v_referral_count);
  END IF;
  
  -- Count unique IPs among referrals
  SELECT COUNT(DISTINCT signup_ip) INTO v_unique_ips
  FROM profiles 
  WHERE referred_by = p_referrer_id AND signup_ip IS NOT NULL;
  
  -- Check if IPs are too concentrated
  IF v_unique_ips < v_referral_count * 0.3 THEN
    v_cluster_score := v_cluster_score + 40;
  END IF;
  
  -- Count unique device fingerprints
  SELECT COUNT(DISTINCT df.fingerprint_hash) INTO v_unique_devices
  FROM profiles p
  JOIN device_fingerprints df ON df.user_id = p.id
  WHERE p.referred_by = p_referrer_id;
  
  IF v_unique_devices < v_referral_count * 0.3 THEN
    v_cluster_score := v_cluster_score + 50;
  END IF;
  
  -- Count banned referrals
  SELECT COUNT(*) INTO v_banned_referrals
  FROM profiles 
  WHERE referred_by = p_referrer_id AND (is_banned = TRUE OR status = 'banned');
  
  IF v_banned_referrals >= 2 THEN
    v_cluster_score := v_cluster_score + 30;
  END IF;
  
  -- Count rapid registrations (within 1 hour of each other)
  SELECT COUNT(*) INTO v_rapid_registrations
  FROM profiles p1
  JOIN profiles p2 ON p2.referred_by = p1.referred_by
  WHERE p1.referred_by = p_referrer_id
    AND p1.id != p2.id
    AND ABS(EXTRACT(EPOCH FROM (p1.created_at - p2.created_at))) < 3600;
  
  IF v_rapid_registrations > v_referral_count * 0.5 THEN
    v_cluster_score := v_cluster_score + 30;
  END IF;
  
  v_is_cluster := v_cluster_score >= 60;
  
  RETURN jsonb_build_object(
    'is_cluster', v_is_cluster,
    'cluster_score', v_cluster_score,
    'referral_count', v_referral_count,
    'unique_ips', v_unique_ips,
    'unique_devices', v_unique_devices,
    'banned_referrals', v_banned_referrals,
    'rapid_registrations', v_rapid_registrations,
    'ip_diversity', ROUND((v_unique_ips::NUMERIC / NULLIF(v_referral_count, 0)) * 100, 1),
    'device_diversity', ROUND((v_unique_devices::NUMERIC / NULLIF(v_referral_count, 0)) * 100, 1)
  );
END;
$$;

-- Trigger to auto-detect clusters when referral count increases
CREATE OR REPLACE FUNCTION auto_detect_referral_cluster()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cluster_check JSONB;
BEGIN
  -- Only run if referred_by was set
  IF NEW.referred_by IS NOT NULL AND OLD.referred_by IS NULL THEN
    -- Check cluster every 5 referrals
    IF (SELECT COUNT(*) FROM profiles WHERE referred_by = NEW.referred_by) % 5 = 0 THEN
      v_cluster_check := detect_referral_clusters(NEW.referred_by);
      
      IF (v_cluster_check->>'is_cluster')::BOOLEAN THEN
        -- Flag the referrer
        INSERT INTO fraud_flags (user_id, flag_type, severity, details, status)
        VALUES (
          NEW.referred_by, 
          'referral_cluster',
          CASE WHEN (v_cluster_check->>'cluster_score')::INTEGER >= 100 THEN 'critical' ELSE 'high' END,
          v_cluster_check,
          'pending'
        )
        ON CONFLICT (user_id, flag_type) DO UPDATE SET
          details = EXCLUDED.details,
          updated_at = NOW();
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_detect_referral_cluster ON profiles;
CREATE TRIGGER trg_auto_detect_referral_cluster
  AFTER UPDATE OF referred_by ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_detect_referral_cluster();

-- Grant permissions
GRANT EXECUTE ON FUNCTION increment_referral_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_self_referral_patterns(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION process_referral_with_fraud_check(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION detect_referral_clusters(UUID) TO authenticated;

-- Add RLS policies
ALTER TABLE referral_fraud_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_network_edges ENABLE ROW LEVEL SECURITY;

-- Only admins can view fraud detections
CREATE POLICY "Admins can view all referral fraud detections"
  ON referral_fraud_detections
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- Users can see their own network edges
CREATE POLICY "Users can view their own referral network"
  ON referral_network_edges
  FOR SELECT
  TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());
