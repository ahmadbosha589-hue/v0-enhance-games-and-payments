-- =====================================================
-- Fix Streak Calculation - Only increment once per day
-- =====================================================

CREATE OR REPLACE FUNCTION atomic_claim(
  p_user_id UUID,
  p_ip_address INET,
  p_device_fingerprint TEXT,
  p_user_agent TEXT,
  p_base_amount BIGINT,
  p_streak_bonus BIGINT DEFAULT 0,
  p_referral_bonus BIGINT DEFAULT 0,
  p_fraud_score INTEGER DEFAULT 0,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lock_id BIGINT;
  v_profile profiles%ROWTYPE;
  v_last_claim_at TIMESTAMPTZ;
  v_cooldown_seconds INTEGER := 300; -- 5 minutes
  v_seconds_remaining INTEGER;
  v_total_amount BIGINT;
  v_new_streak INTEGER;
  v_claim_id UUID;
  v_transaction_id UUID;
  v_result JSONB;
  v_last_claim_date DATE;
  v_today_date DATE;
  v_days_diff INTEGER;
BEGIN
  -- Generate a consistent lock ID from user_id
  v_lock_id := ('x' || substr(md5(p_user_id::text), 1, 15))::bit(60)::bigint;
  
  -- Try to acquire advisory lock (prevents concurrent claims for same user)
  IF NOT pg_try_advisory_xact_lock(v_lock_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CLAIM_IN_PROGRESS',
      'message', 'Another claim is being processed'
    );
  END IF;
  
  -- Check for duplicate idempotency key
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_claim_id FROM claims 
    WHERE user_id = p_user_id 
    AND device_fingerprint = p_device_fingerprint 
    AND created_at > NOW() - INTERVAL '1 hour'
    LIMIT 1;
    
    IF v_claim_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'DUPLICATE_CLAIM',
        'message', 'This claim has already been processed'
      );
    END IF;
  END IF;
  
  -- Get user profile with row lock
  SELECT * INTO v_profile 
  FROM profiles 
  WHERE id = p_user_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'USER_NOT_FOUND',
      'message', 'User profile not found'
    );
  END IF;
  
  -- Check if user is banned
  IF v_profile.status = 'banned' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'USER_BANNED',
      'message', 'Your account has been suspended'
    );
  END IF;
  
  -- Check cooldown (server-side timestamp validation)
  v_last_claim_at := v_profile.last_claim_at;
  IF v_last_claim_at IS NOT NULL THEN
    v_seconds_remaining := GREATEST(0, 
      v_cooldown_seconds - EXTRACT(EPOCH FROM (NOW() - v_last_claim_at))::INTEGER
    );
    
    IF v_seconds_remaining > 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'COOLDOWN_ACTIVE',
        'message', 'Please wait before claiming again',
        'seconds_remaining', v_seconds_remaining,
        'next_claim_at', (v_last_claim_at + (v_cooldown_seconds || ' seconds')::INTERVAL)
      );
    END IF;
  END IF;
  
  -- Fixed streak calculation - only increment once per calendar day
  -- Get current date in UTC
  v_today_date := (NOW() AT TIME ZONE 'UTC')::DATE;
  
  IF v_last_claim_at IS NULL THEN
    -- First claim ever - start streak at 1
    v_new_streak := 1;
  ELSE
    -- Get the date of last claim in UTC
    v_last_claim_date := (v_last_claim_at AT TIME ZONE 'UTC')::DATE;
    -- Calculate difference in days
    v_days_diff := v_today_date - v_last_claim_date;
    
    IF v_days_diff = 0 THEN
      -- Same calendar day - keep current streak (don't increment)
      v_new_streak := COALESCE(v_profile.claim_streak, 1);
    ELSIF v_days_diff = 1 THEN
      -- Consecutive calendar day - increment streak (max 30)
      v_new_streak := LEAST(COALESCE(v_profile.claim_streak, 0) + 1, 30);
    ELSE
      -- More than 1 day gap - reset streak to 1
      v_new_streak := 1;
    END IF;
  END IF;
  -- </CHANGE>
  
  -- Calculate total amount
  v_total_amount := p_base_amount + p_streak_bonus + p_referral_bonus;
  
  -- Create claim record
  INSERT INTO claims (
    user_id, ip_address, device_fingerprint, user_agent,
    base_amount_satoshis, streak_bonus_satoshis, referral_bonus_satoshis,
    amount_satoshis, streak_day, fraud_score, is_flagged
  ) VALUES (
    p_user_id, p_ip_address, p_device_fingerprint, p_user_agent,
    p_base_amount, p_streak_bonus, p_referral_bonus,
    v_total_amount, v_new_streak, p_fraud_score, p_fraud_score > 70
  ) RETURNING id INTO v_claim_id;
  
  -- Update profile balance atomically
  UPDATE profiles SET
    balance_satoshis = balance_satoshis + v_total_amount,
    total_earned_satoshis = total_earned_satoshis + v_total_amount,
    total_claims = total_claims + 1,
    claim_streak = v_new_streak,
    max_claim_streak = GREATEST(max_claim_streak, v_new_streak),
    last_claim_at = NOW(),
    last_active_at = NOW(),
    updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Create transaction record
  INSERT INTO transactions (
    user_id, type, amount_satoshis, 
    balance_before, balance_after,
    claim_id, status, idempotency_key,
    description
  ) VALUES (
    p_user_id, 'claim', v_total_amount,
    v_profile.balance_satoshis, v_profile.balance_satoshis + v_total_amount,
    v_claim_id, 'completed', p_idempotency_key,
    'Faucet claim - Day ' || v_new_streak || ' streak'
  ) RETURNING id INTO v_transaction_id;
  
  -- Return success with all details
  RETURN jsonb_build_object(
    'success', true,
    'claim_id', v_claim_id,
    'transaction_id', v_transaction_id,
    'amount', v_total_amount,
    'base_amount', p_base_amount,
    'streak_bonus', p_streak_bonus,
    'referral_bonus', p_referral_bonus,
    'streak_day', v_new_streak,
    'new_balance', v_profile.balance_satoshis + v_total_amount,
    'next_claim_at', NOW() + (v_cooldown_seconds || ' seconds')::INTERVAL
  );
END;
$$;

-- Also update the helper function if it exists
CREATE OR REPLACE FUNCTION calculate_claim_streak(
  p_last_claim_at TIMESTAMPTZ,
  p_current_streak INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_last_claim_date DATE;
  v_today_date DATE;
  v_days_diff INTEGER;
BEGIN
  IF p_last_claim_at IS NULL THEN
    RETURN 1;
  END IF;
  
  v_today_date := (NOW() AT TIME ZONE 'UTC')::DATE;
  v_last_claim_date := (p_last_claim_at AT TIME ZONE 'UTC')::DATE;
  v_days_diff := v_today_date - v_last_claim_date;
  
  IF v_days_diff = 0 THEN
    -- Same day - keep streak
    RETURN COALESCE(p_current_streak, 1);
  ELSIF v_days_diff = 1 THEN
    -- Consecutive day - increment (max 30)
    RETURN LEAST(COALESCE(p_current_streak, 0) + 1, 30);
  ELSE
    -- Gap > 1 day - reset
    RETURN 1;
  END IF;
END;
$$;
